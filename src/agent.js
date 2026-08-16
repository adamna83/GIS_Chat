/**
 * Agent: the tool-calling loop.
 */
import { state } from './state.js';
import { chatCompletion } from './llm.js';
import { toolSchemas, runTool } from './tools.js';

const SYSTEM_PROMPT = `You are a GIS map assistant embedded in a web map application built with MapLibre GL.

You help the user view and analyze a map through conversation. You can:
- zoom/pan to places (geocode_and_zoom)
- switch basemaps (set_basemap)
- fetch OpenStreetMap data for the current view: roads (fetch_osm_roads) and land use polygons classified as green / commercial / residential / other (fetch_osm_landuse)
- add administrative boundaries (fetch_osm_boundary)
- add, list, zoom, remove and restyle layers
- export the current map as an A4 print layout with title, graticule + coordinates, legend, scale bar, north arrow, CRS and date (export_a4_layout)

Workflow guidance:
1. Before acting, call get_map_state to see the current view and loaded layers.
2. For "roads here", "land use here", "digitize" requests, use the current map bounds.
3. Multi-step requests are encouraged (e.g. zoom to a city, then fetch its roads, then export).
4. When exporting, default to A4 portrait with a sensible title unless the user asks otherwise.
5. Be concise in prose; report what you did and any key numbers (feature counts, place names).
Reply in the same language the user uses.`;

export async function runAgent(userMessage, { onStatus, onDelta }) {
  state.history.push({ role: 'user', content: userMessage });
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...state.history];

  for (let i = 0; i < 8; i++) {
    const msg = await chatCompletion({ messages, tools: toolSchemas });

    if (msg.tool_calls?.length) {
      messages.push(msg);
      state.history.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      for (const call of msg.tool_calls) {
        const name = call.function.name;
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {}
        onStatus?.(name);
        const result = await runTool(name, args);
        const serialized = typeof result === 'string' ? result : JSON.stringify(result);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: serialized,
        });
        state.history.push({ role: 'tool', tool_call_id: call.id, content: serialized });
      }
      continue;
    }

    const finalText = msg.content || '';
    state.history.push({ role: 'assistant', content: finalText });
    return finalText;
  }
  return 'I stopped after several steps. Ask me to continue.';
}

export function resetHistory() {
  state.history = [];
}
