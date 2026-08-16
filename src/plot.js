/**
 * Plot tool: place points from latitude/longitude pairs given as
 * decimal degrees ("5.84, 118.12") or DMS ("5°50'24"N 118°7'12"E").
 */
import { addLayerFromGeoJSON, zoomToFeatures } from './layers.js';

/** Parse a single coordinate part into { value, hemi } or null. */
function parsePart(raw) {
  const s = String(raw).trim();
  if (!s) return null;

  // Space-separated DMS with hemisphere: "5 50 24 N" or "5 50 N"
  let m = s.match(/^([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*([NSEW])$/i);
  if (m) return toValue(m, 1, 2, 3, 4);

  m = s.match(/^([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*([NSEW])$/i);
  if (m) return toValue(m, 1, 2, null, 3);

  // Symbolic / letter DMS: "5°50'24"N", "5d50m24sN", "5:50:24 N", "5.84N"
  m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*[°d:]\s*(?:(\d+(?:\.\d+)?)\s*['′m:]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])$/i);
  if (m) return toValue(m, 1, 2, 3, 4);

  m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEW])$/i);
  if (m) return toValue(m, 1, null, null, 2);

  const num = Number(s);
  if (Number.isFinite(num)) return { value: num, hemi: null };
  return null;
}

function toValue(m, dIdx, mIdx, sIdx, hIdx) {
  let value = Number(m[dIdx]);
  if (mIdx && m[mIdx] !== undefined) value += Number(m[mIdx]) / 60;
  if (sIdx && m[sIdx] !== undefined) value += Number(m[sIdx]) / 3600;
  const hemi = (m[hIdx] || '').toUpperCase() || null;
  if (hemi === 'S' || hemi === 'W') value = -value;
  return { value, hemi };
}

/** Scan text for symbolic DMS coordinates with a hemisphere (e.g. 5°50'24"N). */
function findSymbolicDMS(text) {
  const re = /([+-]?\d+(?:\.\d+)?)\s*[°d]\s*(?:(\d+(?:\.\d+)?)\s*['′m:]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])/gi;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) found.push(toValue(m, 1, 2, 3, 4));
  return found;
}

/** Convert one text line to { lat, lon, label } or null. */
export function parseLine(line) {
  const cleaned = line.replace(/[()\[\]]/g, '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  const coords = {};
  const free = [];
  const consumedFree = { n: 0 };

  const assign = (c) => {
    if (c.hemi === 'N' || c.hemi === 'S') coords.lat = c.value;
    else if (c.hemi === 'E' || c.hemi === 'W') coords.lon = c.value;
    else free.push(c.value);
  };

  for (const part of parts) {
    const parsed = parsePart(part);
    if (parsed) assign(parsed);
  }

  if (coords.lat === undefined && coords.lon === undefined) {
    // No hemisphere told us which is which: scan the whole line for symbolic DMS
    for (const c of findSymbolicDMS(cleaned)) assign(c);
  }

  if (coords.lat !== undefined && coords.lon !== undefined) {
    // both resolved
  } else if (coords.lat === undefined && coords.lon === undefined) {
    if (free.length < 2) return null;
    coords.lat = free[0];
    coords.lon = free[1];
    consumedFree.n = 2;
  } else {
    if (coords.lat === undefined && free.length) coords.lat = free[0];
    if (coords.lon === undefined && free.length) coords.lon = free[free.length - 1];
    if (coords.lat === undefined || coords.lon === undefined) return null;
    consumedFree.n = free.length;
  }

  const { lat, lon } = coords;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const extra = parts.slice(consumedFree.n).filter((p) => !parsePart(p)).join(' ');
  const label = extra && parts.length > 2 ? extra : `(${lat.toFixed(5)}, ${lon.toFixed(5)})`;
  return { lat, lon, label };
}

/** Format a decimal degree as DMS for display. */
export function toDMS(value, isLat) {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mF = (abs - d) * 60;
  const m = Math.floor(mF);
  const s = (mF - m) * 60;
  return `${d}\u00b0${m}'${s.toFixed(2)}"${hemi}`;
}

/** Parse a block of coordinates and return a point FeatureCollection. */
export function parseCoordinates(text, lonFirst = false) {
  const features = [];
  const errors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const pt = parseLine(line);
    if (!pt) {
      errors.push(line);
      continue;
    }
    let lon = pt.lon;
    let lat = pt.lat;
    if (lonFirst) [lon, lat] = [lat, lon];
    features.push({
      type: 'Feature',
      properties: {
        Latitude: +lat.toFixed(7),
        Longitude: +lon.toFixed(7),
        DMS: `${toDMS(lat, true)} ${toDMS(lon, false)}`,
        name: String(pt.label),
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    });
  }
  return { features, errors };
}

/** Plot parsed coordinates as a layer and zoom to them. */
export async function plotCoordinates(text, lonFirst) {
  const { features, errors } = parseCoordinates(text, lonFirst);
  if (!features.length) {
    throw new Error('No valid coordinates found. Use e.g. "5.84, 118.12" or "5°50\'24"N 118°7\'12"E".');
  }
  const fc = { type: 'FeatureCollection', features };
  const layer = await addLayerFromGeoJSON('Plotted points', fc, { kind: 'point', color: '#d81b60' });
  zoomToFeatures(layer.geojson);
  return { count: features.length, errors };
}
