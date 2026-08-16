/**
 * File import: SHP (+dbf/prj or zip), KML, CSV/TXT (lon,lat), GeoJSON.
 * Returns a parsed { name, geojson } or an array of them.
 */
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';

function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

async function bufferOf(file) {
  return file.arrayBuffer();
}

async function textOf(file) {
  return file.text();
}

/** Parse a .shp (optionally with .dbf / .prj siblings or inside a .zip). */
async function parseShp(files) {
  const byExt = {};
  for (const f of files) byExt[extOf(f.name)] = f;

  if (byExt.zip) {
    const geojson = await shp(await bufferOf(byExt.zip));
    return Array.isArray(geojson)
      ? geojson.map((g) => ({ name: g.fileName || 'shapefile', geojson: g }))
      : [{ name: geojson.fileName || 'shapefile', geojson }];
  }

  if (!byExt.shp) throw new Error('A .shp file (and optionally its .dbf/.prj) is required.');
  const payload = { shp: await bufferOf(byExt.shp) };
  if (byExt.dbf) payload.dbf = await bufferOf(byExt.dbf);
  if (byExt.prj) payload.prj = await textOf(byExt.prj);
  if (byExt.cpg) payload.cpg = await textOf(byExt.cpg);

  const geojson = await shp(payload);
  const stem = (byExt.shp.name.split('.').slice(0, -1).join('.') || 'shapefile');
  return [{ name: stem, geojson }];
}

/** Parse a KML document into GeoJSON. */
function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Invalid KML/XML file.');
  }
  return kml(doc);
}

/** Guess the delimiter of a CSV-ish table. */
function detectDelimiter(line) {
  for (const d of [',', ';', '\t', '|']) {
    if (line.includes(d)) return d;
  }
  return ',';
}

/** Parse CSV/TXT into a point FeatureCollection. Columns: lon then lat. */
function parseTable(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error('File is empty.');

  const delim = detectDelimiter(lines[0]);
  const split = (l) => l.split(delim).map((s) => s.trim()).filter((s) => s !== '');

  const header = split(lines[0]);
  const hasHeader = header.every((h) => isNaN(Number(h)));

  const colIdx = (names) => {
    if (!hasHeader) return -1;
    return header.findIndex((h) => names.includes(h.toLowerCase()));
  };
  const lonIdx = colIdx(['lon', 'long', 'longitude', 'x', 'east', 'easting', 'lng']);
  const latIdx = colIdx(['lat', 'latitude', 'y', 'north', 'northing']);
  const nameIdx = hasHeader ? header.findIndex((h) => ['name', 'label', 'id'].includes(h.toLowerCase())) : -1;

  const rows = hasHeader ? lines.slice(1) : lines;
  const features = [];
  for (const line of rows) {
    const cells = split(line);
    let lon, lat, label;
    if (hasHeader && lonIdx >= 0 && latIdx >= 0) {
      lon = Number(cells[lonIdx]);
      lat = Number(cells[latIdx]);
      label = nameIdx >= 0 ? cells[nameIdx] : undefined;
    } else {
      const nums = cells.map(Number);
      lon = nums[0];
      lat = nums[1];
      label = cells[2];
    }
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const properties = { Longitude: lon, Latitude: lat };
    if (label !== undefined && label !== '') properties.name = label;
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }
  if (!features.length) throw new Error('No valid coordinate rows found (expect lon, lat).');
  return { type: 'FeatureCollection', features };
}

/** Dispatch a set of selected files to the right parser. */
export async function importFiles(files) {
  const list = [...files];
  if (!list.length) throw new Error('No files selected.');

  const ext = extOf(list[0].name);
  if (ext === 'zip' || ext === 'shp' || list.some((f) => extOf(f.name) === 'shp')) {
    return parseShp(list);
  }
  if (ext === 'kml' || ext === 'kmz') {
    const f = list.find((x) => extOf(x.name) === 'kml') || list[0];
    return [{ name: (f.name.split('.').slice(0, -1).join('.') || 'kml'), geojson: parseKml(await textOf(f)) }];
  }
  if (ext === 'geojson' || ext === 'json') {
    const f = list[0];
    const geojson = JSON.parse(await textOf(f));
    if (!geojson.type || !Array.isArray(geojson.features)) throw new Error('Invalid GeoJSON.');
    return [{ name: (f.name.split('.').slice(0, -1).join('.') || 'geojson'), geojson }];
  }
  if (ext === 'csv' || ext === 'txt') {
    const f = list[0];
    return [{ name: (f.name.split('.').slice(0, -1).join('.') || 'points'), geojson: parseTable(await textOf(f)) }];
  }
  throw new Error(`Unsupported file type ".${ext}". Supported: .shp / .zip / .kml / .csv / .txt / .geojson`);
}
