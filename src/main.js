/**
 * Application entry point.
 */
import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { initMap, BASEMAPS, setBasemap } from './map.js';
import { wireChatUI, wireSettingsUI, wireExportUI, wireBasemapUI, setStatus } from './ui.js';
import { initSidebar } from './sidebar.js';
import { state } from './state.js';

initMap('mapContainer');
const map = state.map;
window.__map = map;
window.__state = state;

map.on('load', () => {
  wireBasemapUI('basemapSelect', BASEMAPS, setBasemap);
  wireChatUI();
  wireSettingsUI();
  wireExportUI();
  initSidebar();
  setStatus('Ready. Ask the assistant to work with the map, or use the export button.');
});
