import { Map as MapLibreMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import { state } from './state.js';

export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

export const BASEMAPS = {
  osm: {
    name: 'OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  carto_voyager: {
    name: 'Carto Voyager',
    tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
    maxzoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  carto_dark: {
    name: 'Carto Dark',
    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    maxzoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/">CARTO</a>',
  },
  esri_imagery: {
    name: 'ESRI World Imagery',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    maxzoom: 18,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  opentopo: {
    name: 'OpenTopoMap',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom: 17,
    attribution:
      'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
};

function makeStyle(basemapDef) {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      basemap: {
        type: 'raster',
        tiles: basemapDef.tiles,
        tileSize: 256,
        maxzoom: basemapDef.maxzoom ?? 19,
        attribution: basemapDef.attribution,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

export function initMap(container) {
  const basemap = BASEMAPS.osm;
  state.basemap = basemap;

  const map = new MapLibreMap({
    container,
    style: makeStyle(basemap),
    center: [118.11, 5.84], // Sandakan, Sabah
    zoom: 11,
    attributionControl: true,
  });

  map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

  state.map = map;
  return map;
}

export function setBasemap(id) {
  const def = BASEMAPS[id];
  if (!def) return;
  state.basemap = def;
  const src = state.map.getSource('basemap');
  src.setTiles(def.tiles);
  src.setAttribution(def.attribution);
}

/** Snapshot of current map state for the agent's context. */
export function getMapState() {
  const map = state.map;
  const b = map.getBounds();
  return {
    center: map.getCenter().toArray(),
    zoom: +map.getZoom().toFixed(2),
    bounds: {
      west: +b.getWest().toFixed(6),
      south: +b.getSouth().toFixed(6),
      east: +b.getEast().toFixed(6),
      north: +b.getNorth().toFixed(6),
    },
    basemap: state.basemap.name,
    layers: [...state.layers.values()].map((l) => ({
      id: l.id,
      name: l.name,
      types: [...l.types],
      visible: l.visible,
    })),
  };
}
