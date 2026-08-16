/**
 * Nominatim geocoding: resolve a place name to coordinates + zoom.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export async function geocode(place) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(place)}&format=jsonv2&limit=1&polygon_geojson=1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AI-Map-Assistant/1.0' },
  });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const results = await res.json();
  if (!results.length) throw new Error(`Could not find "${place}".`);
  const r = results[0];
  return {
    name: r.display_name,
    lon: parseFloat(r.lon),
    lat: parseFloat(r.lat),
    bbox: r.boundingbox
      ? {
          south: parseFloat(r.boundingbox[0]),
          north: parseFloat(r.boundingbox[1]),
          west: parseFloat(r.boundingbox[2]),
          east: parseFloat(r.boundingbox[3]),
        }
      : null,
  };
}
