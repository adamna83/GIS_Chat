/**
 * Overpass (OSM) data fetching for the current map bounds.
 * Returns GeoJSON FeatureCollections.
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter';

async function runOverpass(query) {
  const url = `${OVERPASS}?data=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

function waysToGeoJSON(elements, props) {
  const features = [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    const coords = geom.map((p) => [p.lon, p.lat]);
    const properties = {};
    for (const [key, fn] of Object.entries(props)) properties[key] = fn(el.tags || {});
    properties.osm_id = el.id;
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  return { type: 'FeatureCollection', features };
}

function areasToGeoJSON(elements, props) {
  const features = [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const geom = el.geometry;
    if (!geom || geom.length < 3) continue;
    const coords = geom.map((p) => [p.lon, p.lat]);
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }
    const properties = {};
    for (const [key, fn] of Object.entries(props)) properties[key] = fn(el.tags || {});
    properties.osm_id = el.id;
    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function bboxQuery(bbox) {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

/** Fetch roads (highways) within the given bounds. */
export async function fetchRoads(bbox) {
  const q = `[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|track|footway|path)$"](${bboxQuery(bbox)});
out geom;`;
  const data = await runOverpass(q);
  return waysToGeoJSON(data.elements, {
    highway: (t) => t.highway || 'unknown',
    name: (t) => t.name || '',
  });
}

/** Classify OSM landuse/leisure/natural tags into broad use types. */
const GREEN = new Set([
  'forest', 'grass', 'meadow', 'park', 'recreation_ground', 'greenfield',
  'village_green', 'garden', 'orchard', 'vineyard', 'cemetery', 'nature_reserve',
  'wood', 'grassland', 'common', 'playground', 'golf_course', 'scrub', 'heath',
]);
const COMMERCIAL = new Set(['commercial', 'retail', 'industrial', 'landfill', 'quarry', 'construction', 'brownfield']);
const RESIDENTIAL = new Set(['residential', 'apartments', 'allotments', 'garages']);

export function classifyLanduse(tags) {
  const v = tags.landuse || tags.leisure || tags.natural || '';
  if (GREEN.has(v)) return 'green';
  if (COMMERCIAL.has(v)) return 'commercial';
  if (RESIDENTIAL.has(v)) return 'residential';
  return 'other';
}

/** Fetch land-use/leisure polygons within the given bounds, classified. */
export async function fetchLanduse(bbox) {
  const q = `[out:json][timeout:90];
(
  way["landuse"](${bboxQuery(bbox)});
  way["leisure"](${bboxQuery(bbox)});
  way["natural"="wood"](${bboxQuery(bbox)});
  way["natural"="grassland"](${bboxQuery(bbox)});
);
out geom;`;
  const data = await runOverpass(q);
  return areasToGeoJSON(data.elements, {
    landuse_type: (t) => classifyLanduse(t),
    landuse: (t) => t.landuse || t.leisure || t.natural || '',
    name: (t) => t.name || '',
  });
}

/** Fetch a boundary polygon (state/country) by name, e.g. "Selangor". */
export async function fetchBoundary(name) {
  const q = `[out:json][timeout:60];
relation["boundary"="administrative"]["name"~"${escapeRegExp(name)}",i]["admin_level"~"4|5|6"];
out geom;`;
  const data = await runOverpass(q);
  // Prefer the first relation with a polygonizable geometry.
  const rel = data.elements.find((el) => el.type === 'relation' && el.members?.length);
  if (!rel) throw new Error(`No boundary found for "${name}".`);
  const rings = [];
  for (const m of rel.members || []) {
    if (m.role === 'outer' && m.geometry && m.geometry.length >= 3) {
      rings.push(m.geometry.map((p) => [p.lon, p.lat]));
    }
  }
  if (!rings.length) throw new Error(`Boundary "${name}" has no outer ring geometry.`);
  const polygon = rings.length === 1
    ? { type: 'Polygon', coordinates: rings }
    : { type: 'MultiPolygon', coordinates: [rings] };
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: rel.tags?.name || name }, geometry: polygon },
    ],
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
