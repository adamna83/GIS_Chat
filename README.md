# AI Map Assistant (`gis_chat`)

A standalone web map application with a conversational GIS assistant. It combines a
[MapLibre GL](https://maplibre.org/) map with an LLM chatbot that can drive the map
through function/tool calling — entirely **in the browser**.

Styled with the Petronas color theme.

![petronas-teal](https://img.shields.io/badge/theme-Petronas-00a19c)
![vite](https://img.shields.io/badge/build-vite-646cff)
![maplibre](https://img.shields.io/badge/map-MapLibre_GL-396CB2)

---

## Features

### Conversational map assistant
- Chat with an LLM that calls map tools: geocoding, basemap switching, OSM data
  fetching, layer management, styling and A4 export.
- Tool-calling loop with an 8-step budget; every tool runs client-side.
- Works with any **OpenAI-compatible** endpoint (base URL, model and API key are
  configured in the app and stored in `localStorage`).
- **Note:** native `api.openai.com` / `api.anthropic.com` endpoints usually block
  browser CORS — use a compatible gateway (e.g. **OpenRouter**, **Ollama**,
  **LM Studio**) or a local model.

### Data layers (left sidebar)
A tabbed panel mirroring the chat panel design:

| Tab | Purpose |
|-----|---------|
| **Layers** | List loaded layers with a color swatch, feature count, geometry type, and controls to **show/hide**, **zoom to** and **remove** each layer |
| **Import** | Import **.shp** (with its `.dbf` / `.prj` selected together, or a `.zip`), **.kml**, **.csv** / **.txt** (lon, lat columns), and **.geojson** |
| **Measure** | Click points on the map to trace a line; distance shown in **kilometres**; double-click to finish |
| **Draw** | Draw **point**, **polyline** or **polygon** directly on the map (click vertices, double-click / Finish to commit) |
| **Plot** | Plot XY coordinates in **decimal degrees** (`5.84, 118.12`) or **DMS** (`5°50'24"N 118°07'12"E`), including space-separated and S/W forms; optional "longitude first" |

### A4 print export
Full A4 layout export (PNG or PDF), portrait or landscape, containing:
- map title
- graticule with coordinate values
- legend
- scale bar
- north arrow
- CRS information and generation date

### Map
- Basemaps: **OpenStreetMap**, **Carto Voyager**, **Carto Dark**, **ESRI World
  Imagery**, **OpenTopoMap**.
- Live OpenStreetMap data via **Overpass**: roads, land use (classified into
  green / commercial / residential / other), and administrative boundaries via
  Nominatim geocoding.

---

## Getting started

```bash
cd gis_chat
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the build locally
```

### Configure the LLM
1. Open the app and click the **gear icon** (top right).
2. Set **Base URL**, **Model** and **API Key**. Examples:
   - OpenRouter: `https://openrouter.ai/api/v1`, model `openai/gpt-4o-mini`
   - Ollama (local): `http://localhost:11434/v1`, model `llama3.1` (no key)
   - LM Studio: `http://localhost:1234/v1`
3. Click **Test Connection**, then **Save**.

---

## Architecture

```
src/
├── main.js      # Entry point: initialises map + wires UI on map 'load'
├── state.js     # Shared state (map ref, layers, history) + tiny pub/sub (notify)
├── map.js       # MapLibre init, basemap definitions, getMapState()
├── layers.js    # addLayerFromGeoJSON (categorized/standard styles), visibility,
│                #   style updates, zoom helpers, layer registry
├── overpass.js  # OSM Overpass queries → GeoJSON (roads, landuse, boundary)
├── geocode.js   # Nominatim geocoding
├── llm.js       # OpenAI-compatible chat client + config persistence
├── agent.js     # Tool-calling loop + system prompt
├── tools.js     # 11 agent tool schemas + implementations + runTool()
├── layout.js    # A4 print layout export (PDF / PNG)
├── ui.js        # Chat bubbles, tool status, toasts, settings/export wiring
├── sidebar.js   # Left panel wiring: layers list, import, measure, draw, plot
├── import.js    # SHP / KML / CSV / TXT / GeoJSON parsing (shpjs, @tmcw/togeojson)
├── measure.js   # Click-to-measure distance in km (turf.length)
├── draw.js      # Native point / polyline / polygon drawing on the map
├── plot.js      # XY plotting: DD + DMS coordinate parser
└── style.css    # Petronas dark theme
```

### Agent tools
`get_map_state`, `geocode_and_zoom`, `set_basemap`, `fetch_osm_roads`,
`fetch_osm_landuse`, `fetch_osm_boundary`, `list_layers`, `zoom_to_layer`,
`remove_layer`, `style_layer`, `export_a4_layout`.

### Key implementation notes
- **Layer adding is async and style-safe** — `addLayerFromGeoJSON` waits for the
  map style to finish loading before adding sources/layers, so there are no silent
  timing failures.
- **Fetched OSM data auto-zooms** to its extent after being added.
- **Tool errors are never silent** — `runTool` logs to the console, shows a toast,
  and returns `{ error }` to the agent.
- The layer registry (`state.layers`) is the single source of truth for the map
  data; the sidebar re-renders via a lightweight pub/sub (`onStateChange`).

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `maplibre-gl` | Web map rendering |
| `@turf/turf` | Geospatial math (length, bbox) |
| `jspdf` | A4 PDF layout export |
| `html2canvas` | Raster export of the map canvas |
| `shpjs` | Shapefile parsing |
| `@tmcw/togeojson` | KML parsing |
| `vite` | Build tool / dev server |

---

## Troubleshooting

- **Nothing renders / layers not visible** — hard-refresh (`Ctrl+F5`) after pulling
  changes, and check the browser console (F12) for errors. Confirm layers are
  present under **Layers** and that their visibility toggle is on.
- **Overpass "HTTP 429"** — the Overpass API is rate limited; wait a moment and
  retry, or zoom out to a smaller area.
- **LLM won't connect** — native OpenAI/Anthropic endpoints block browser CORS;
  use a gateway such as OpenRouter or a local Ollama/LM Studio server.

---

This is personal project - proof of concept
