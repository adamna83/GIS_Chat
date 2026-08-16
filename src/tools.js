/**
 * Agent tools: schemas for the LLM + browser-side implementations.
 */
import { getMapState, setBasemap, BASEMAPS } from './map.js';
import { addLayerFromGeoJSON, removeLayer, zoomToLayer, findLayerByName, updateLayerStyle } from './layers.js';
import { geocode } from './geocode.js';
import { fetchRoads, fetchLanduse, fetchBoundary } from './overpass.js';
import { exportA4 } from './layout.js';
import { state } from './state.js';
import { toast } from './ui.js';

const MAP = () => getMapState();

function summary(fc) {
  return { features: fc.features?.length ?? 0, sample: (fc.features?.[0] || null)?.properties || null };
}

const tools = [
  {
    name: 'get_map_state',
    description: 'Get the current map state: center, zoom, bounds, basemap and list of loaded layers.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => MAP(),
  },
  {
    name: 'geocode_and_zoom',
    description: 'Geocode a place name (city, state, country) and move the map to it. Returns its coordinates and bounds.',
    parameters: {
      type: 'object',
      properties: { place: { type: 'string', description: 'Place name, e.g. "Sandakan", "Selangor"' } },
      required: ['place'],
      additionalProperties: false,
    },
    run: async ({ place }) => {
      const g = await geocode(place);
      if (g.bbox) {
        state.map.fitBounds(
          [
            [g.bbox.west, g.bbox.south],
            [g.bbox.east, g.bbox.north],
          ],
          { padding: 50 }
        );
      } else {
        state.map.flyTo({ center: [g.lon, g.lat], zoom: 11 });
      }
      return { name: g.name, lon: g.lon, lat: g.lat, bbox: g.bbox };
    },
  },
  {
    name: 'set_basemap',
    description: 'Switch the basemap. Options: osm, carto_voyager, carto_dark, esri_imagery, opentopo.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: Object.keys(BASEMAPS), description: 'Basemap id' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run: async ({ id }) => {
      if (!BASEMAPS[id]) throw new Error(`Unknown basemap "${id}". Valid: ${Object.keys(BASEMAPS).join(', ')}`);
      setBasemap(id);
      return { ok: true, basemap: id, name: BASEMAPS[id].name };
    },
  },
  {
    name: 'fetch_osm_roads',
    description: 'Fetch roads from OpenStreetMap within the current map view and add them as a "roads" layer.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const fc = await fetchRoads(MAP().bounds);
      const layer = await addLayerFromGeoJSON('OSM Roads', fc, { kind: 'line', color: '#1565c0' });
      zoomToLayer(layer.id);
      return summary(fc);
    },
  },
  {
    name: 'fetch_osm_landuse',
    description: 'Fetch land use / land cover polygons (parks, forest, residential, commercial, etc.) from OpenStreetMap within the current map view and add them as a classified "land use" layer.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const fc = await fetchLanduse(MAP().bounds);
      const layer = await addLayerFromGeoJSON('OSM Land Use', fc, { kind: 'polygon', field: 'landuse_type' });
      zoomToLayer(layer.id);
      return summary(fc);
    },
  },
  {
    name: 'fetch_osm_boundary',
    description: 'Fetch the administrative boundary polygon for a named place (e.g. "Selangor") and add it as a layer, zooming to it.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Place / state / country name' } },
      required: ['name'],
      additionalProperties: false,
    },
    run: async ({ name }) => {
      const fc = await fetchBoundary(name);
      const layer = await addLayerFromGeoJSON(`${name} boundary`, fc, { kind: 'polygon', color: '#00635B' });
      zoomToLayer(layer.id);
      return summary(fc);
    },
  },
  {
    name: 'list_layers',
    description: 'List all currently loaded map layers with their ids, geometry types and visibility.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => MAP().layers,
  },
  {
    name: 'zoom_to_layer',
    description: 'Zoom the map to fit a loaded layer, identified by its id or name.',
    parameters: {
      type: 'object',
      properties: { layer: { type: 'string', description: 'Layer id or name' } },
      required: ['layer'],
      additionalProperties: false,
    },
    run: async ({ layer }) => {
      const l = findLayerByName(layer) || [...MAP().layers].map((x) => x).find((x) => x.id === layer);
      if (!l) throw new Error(`Layer "${layer}" not found.`);
      zoomToLayer(l.id);
      return { ok: true, id: l.id, name: l.name };
    },
  },
  {
    name: 'remove_layer',
    description: 'Remove a loaded layer from the map by id or name.',
    parameters: {
      type: 'object',
      properties: { layer: { type: 'string', description: 'Layer id or name' } },
      required: ['layer'],
      additionalProperties: false,
    },
    run: async ({ layer }) => {
      const l = findLayerByName(layer) || [...MAP().layers].map((x) => x).find((x) => x.id === layer);
      if (!l) throw new Error(`Layer "${layer}" not found.`);
      removeLayer(l.id);
      return { ok: true, removed: l.name };
    },
  },
  {
    name: 'style_layer',
    description: "Change a loaded layer's color or opacity by id or name.",
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Layer id or name' },
        color: { type: 'string', description: 'Hex color e.g. #ff0000' },
        opacity: { type: 'number', description: '0-1' },
      },
      required: ['layer'],
      additionalProperties: false,
    },
    run: async ({ layer, color, opacity }) => {
      const l = findLayerByName(layer) || [...MAP().layers].map((x) => x).find((x) => x.id === layer);
      if (!l) throw new Error(`Layer "${layer}" not found.`);
      const patch = {};
      if (color) patch.color = color;
      if (opacity !== undefined) patch.opacity = opacity;
      updateLayerStyle(l.id, patch);
      return { ok: true, id: l.id, name: l.name, ...patch };
    },
  },
  {
    name: 'export_a4_layout',
    description: "Export the current map as an A4 print layout (PDF or PNG). Elements: map title, graticule with coordinate values, legend, scale bar, north arrow, CRS info and generation date. Choose orientation 'portrait' or 'landscape' and a title.",
    parameters: {
      type: 'object',
      properties: {
        orientation: { type: 'string', enum: ['portrait', 'landscape'], description: 'A4 orientation (default portrait)' },
        title: { type: 'string', description: 'Map title shown on the layout' },
        format: { type: 'string', enum: ['pdf', 'png'], description: 'Output format (default pdf)' },
      },
      additionalProperties: false,
    },
    run: async ({ orientation = 'portrait', title = 'Map', format = 'pdf' }) => {
      const file = await exportA4({ orientation, title, format });
      return { ok: true, file, orientation, title, format };
    },
  },
];

export const toolSchemas = tools.map(({ name, description, parameters }) => ({
  type: 'function',
  function: { name, description, parameters },
}));

export const toolMap = Object.fromEntries(tools.map((t) => [t.name, t.run]));

export async function runTool(name, args) {
  const fn = toolMap[name];
  if (!fn) throw new Error(`Unknown tool "${name}".`);
  try {
    return await fn(args || {});
  } catch (err) {
    console.error(`[tool:${name}]`, err);
    toast(`Tool "${name}" failed: ${err.message}`, 'error');
    return { error: err.message };
  }
}
