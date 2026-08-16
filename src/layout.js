/**
 * A4 print-layout export (PDF / PNG).
 * Elements: map title, graticule lines + coordinate values, legend, scale bar,
 * north arrow, CRS information, and generation date.
 * Supported orientations: A4 portrait (210x297) and landscape (297x210).
 */
import { jsPDF } from 'jspdf';
import { state } from './state.js';

const MM_PER_INCH = 25.4;
const DPI = 300;
const SCALE = DPI / MM_PER_INCH; // pixels per mm

export async function exportA4({ orientation = 'portrait', title = 'Map', format = 'pdf' } = {}) {
  const portrait = orientation === 'portrait';
  const pageW = portrait ? 210 : 297; // mm
  const pageH = portrait ? 297 : 210; // mm

  const canvas = await composeLayout({ portrait, pageW, pageH, title });
  const filename = `${title.replace(/\s+/g, '_') || 'map'}_A4.${format === 'pdf' ? 'pdf' : 'png'}`;

  if (format === 'png') {
    await downloadDataURL(canvas.toDataURL('image/png'), filename);
    return filename;
  }

  const pdf = new jsPDF({
    orientation: portrait ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [pageW, pageH],
    compress: true,
  });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
  pdf.save(filename);
  return filename;
}

async function composeLayout({ portrait, pageW, pageH, title }) {
  const map = state.map;
  await waitForMapIdle(map);

  const cvW = Math.round(pageW * SCALE);
  const cvH = Math.round(pageH * SCALE);
  const out = document.createElement('canvas');
  out.width = cvW;
  out.height = cvH;
  const ctx = out.getContext('2d');

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cvW, cvH);

  // ---------- geometry (mm) ----------
  const M = 10; // margin
  const titleH = 18;
  const footH = 26;
  const northSize = 18;

  const mapBox = portrait
    ? { x: M, y: M + titleH, w: pageW - 2 * M, h: pageH - M - titleH - footH - M }
    : { x: M, y: M + titleH, w: pageW - 2 * M - 70, h: pageH - M - titleH - footH - M };

  // ---------- draw the map ----------
  drawMap(ctx, mapBox, SCALE);

  // ---------- graticule + coordinate values ----------
  const gridOn = true;
  drawGraticule(ctx, map, mapBox, SCALE, gridOn);

  // ---------- north arrow ----------
  drawNorthArrow(ctx, mapBox.x + mapBox.w - northSize - 4, mapBox.y + 4, northSize, SCALE);

  // ---------- title ----------
  drawTitle(ctx, pageW, title);

  // ---------- legend ----------
  const legendW = portrait ? 90 : 55;
  const legendX = portrait ? M : pageW - M - legendW;
  const legendY = portrait ? mapBox.y + mapBox.h + 2 : mapBox.y;
  drawLegend(ctx, legendX, legendY, legendW, SCALE, portrait);

  // ---------- scale bar ----------
  const scaleW = 80;
  const scaleX = portrait ? M + legendW + 5 : M;
  const scaleY = portrait ? mapBox.y + mapBox.h + 2 : pageH - M - 8;
  drawScaleBar(ctx, scaleX, scaleY, scaleW, map, SCALE);

  // ---------- CRS + date ----------
  drawFooter(ctx, pageW, pageH, M);

  // Thin page frame
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cvW - 1, cvH - 1);

  return out;
}

// ---------------------------------------------------------------------------

function drawMap(ctx, box, scale) {
  const map = state.map;
  const src = map.getCanvas();
  const x = box.x * scale;
  const y = box.y * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(src, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function niceInterval(spanDeg) {
  if (!(spanDeg > 0)) return 0.01;
  const raw = spanDeg / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let n;
  if (norm < 1.5) n = 1;
  else if (norm < 3.5) n = 2;
  else if (norm < 7.5) n = 5;
  else n = 10;
  return n * mag;
}

function drawGraticule(ctx, map, box, scale, gridOn) {
  const b = map.getBounds();
  const { west, south, east, north } = {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  };
  const spanLon = east - west;
  const spanLat = north - south;
  const interval = niceInterval(Math.max(spanLon, spanLat));

  const x = (mm) => box.x * scale + mm;
  const y = (mm) => box.y * scale + mm;
  const mmW = box.w * scale;
  const mmH = box.h * scale;

  ctx.font = `${Math.round(7 * scale)}px Arial`;
  ctx.fillStyle = '#333333';
  ctx.strokeStyle = gridOn ? 'rgba(90,90,90,0.55)' : 'rgba(90,90,90,0.2)';
  ctx.lineWidth = 1;

  // Longitude lines
  const lonStart = Math.ceil(west / interval) * interval;
  for (let lon = lonStart; lon <= east; lon += interval) {
    const p1 = map.project([lon, south]);
    const p2 = map.project([lon, north]);
    const sx = (p1.x / map.getCanvas().width) * mmW;
    const ex = (p2.x / map.getCanvas().width) * mmW;
    ctx.beginPath();
    ctx.moveTo(x + sx, y);
    ctx.lineTo(x + ex, y + mmH);
    ctx.stroke();
    const label = formatCoord(lon, false);
    ctx.textAlign = 'center';
    ctx.fillText(label, x + sx, y + mmH + 10 * scale);
    ctx.fillText(label, x + sx, y - 4 * scale);
  }

  // Latitude lines
  const latStart = Math.ceil(south / interval) * interval;
  for (let lat = latStart; lat <= north; lat += interval) {
    const p1 = map.project([west, lat]);
    const p2 = map.project([east, lat]);
    const sy = (p1.y / map.getCanvas().height) * mmH;
    const ey = (p2.y / map.getCanvas().height) * mmH;
    ctx.beginPath();
    ctx.moveTo(x, y + sy);
    ctx.lineTo(x + mmW, y + ey);
    ctx.stroke();
    const label = formatCoord(lat, true);
    ctx.textAlign = 'right';
    ctx.fillText(label, x - 4 * scale, y + sy);
    ctx.textAlign = 'left';
    ctx.fillText(label, x + mmW + 4 * scale, y + sy);
  }
}

function formatCoord(value, isLat) {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(3)}\u00B0${hemi}`;
}

function drawTitle(ctx, pageWmm, title) {
  const scale = SCALE;
  ctx.fillStyle = '#00635B';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `bold ${Math.round(16 * scale)}px Arial`;
  ctx.fillText(title || 'Map', 10 * scale, 20 * scale);

  // decorative underline
  ctx.fillStyle = '#00A19C';
  ctx.fillRect(10 * scale, 24 * scale, 60 * scale, 2.5 * scale);
  ctx.textBaseline = 'alphabetic';
}

function drawNorthArrow(ctx, xmm, ymm, sizemm, scale) {
  const cx = xmm * scale;
  const cy = ymm * scale;
  const s = sizemm * scale;
  ctx.save();
  ctx.translate(cx + s / 2, cy + s / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.42);
  ctx.lineTo(s * 0.3, s * 0.4);
  ctx.lineTo(0, s * 0.12);
  ctx.lineTo(-s * 0.3, s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#00635B';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.42);
  ctx.lineTo(s * 0.3, s * 0.4);
  ctx.lineTo(0, s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold ${Math.round(6 * scale)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -s * 0.5);
  ctx.restore();
}

function drawLegend(ctx, xmm, ymm, wmm, scale, portrait) {
  const layers = [...state.layers.values()].filter((l) => l.visible);
  if (!layers.length) return;

  const fontSize = 9;
  const lineH = (fontSize + 3) * scale;
  const titleH = 12 * scale;
  const boxW = 8 * scale;
  const x = xmm * scale;
  let y = ymm * scale;

  ctx.fillStyle = '#00635B';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.fillText('Legend', x, y + fontSize * 0.9);
  y += titleH;

  const maxRows = portrait ? 5 : 12;
  const rows = layers.slice(0, maxRows);

  for (const layer of rows) {
    if (y > (ymm + 60) * scale) break;
    // swatch
    ctx.fillStyle = layer.color || '#666';
    ctx.globalAlpha = 0.7;
    if (layer.types.has('point')) {
      ctx.beginPath();
      ctx.arc(x + boxW / 2, y + 3 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else if (layer.types.has('line')) {
      ctx.strokeStyle = layer.color || '#666';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y + 3 * scale);
      ctx.lineTo(x + boxW, y + 3 * scale);
      ctx.stroke();
    } else {
      ctx.fillRect(x, y + 1.5 * scale, boxW, 5 * scale);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y + 1.5 * scale, boxW, 5 * scale);
    }
    // label
    ctx.fillStyle = '#222222';
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(layer.name, x + boxW + 6 * scale, y + (fontSize - 2) * scale);
    y += lineH;
  }
  if (layers.length > maxRows) {
    ctx.fillStyle = '#666';
    ctx.font = `italic ${fontSize}px Arial`;
    ctx.fillText(`+${layers.length - maxRows} more`, x + boxW + 6 * scale, y);
  }
}

function drawScaleBar(ctx, xmm, ymm, wmm, map, scale) {
  const b = map.getBounds();
  const topM = haversine(b.getWest(), b.getNorth(), b.getEast(), b.getNorth());
  const barMeters = niceScale(topM);
  const pxPerM = (wmm * scale) / topM;
  const barPx = barMeters * pxPerM;

  const x = xmm * scale;
  const y = ymm * scale;
  ctx.strokeStyle = '#111111';
  ctx.fillStyle = '#111111';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + barPx, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 3 * scale);
  ctx.lineTo(x, y + 3 * scale);
  ctx.moveTo(x + barPx, y - 3 * scale);
  ctx.lineTo(x + barPx, y + 3 * scale);
  ctx.stroke();

  ctx.font = `${Math.round(8 * scale)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(formatScale(barMeters), x + barPx / 2, y - 6 * scale);
}

function niceScale(target) {
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  let n;
  if (norm < 1.5) n = 1;
  else if (norm < 3.5) n = 2;
  else if (norm < 7.5) n = 5;
  else n = 10;
  return n * mag;
}

function formatScale(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}

function haversine(lon1, lat1, lon2, lat2) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function drawFooter(ctx, pageWmm, pageHmm, margin) {
  const scale = SCALE;
  const today = new Date().toISOString().slice(0, 10);
  const crsText = 'CRS: WGS 84 / Web Mercator (EPSG:3857)';
  const dateText = `Generated: ${today}`;

  ctx.fillStyle = '#444444';
  ctx.font = `${Math.round(8 * scale)}px Arial`;
  ctx.textBaseline = 'alphabetic';

  const bottom = (pageHmm - margin - 12) * scale;

  ctx.textAlign = 'left';
  ctx.fillText(crsText, margin * scale, bottom);
  ctx.textAlign = 'right';
  ctx.fillText(dateText, (pageWmm - margin) * scale, bottom);
  ctx.textBaseline = 'alphabetic';
}

async function waitForMapIdle(map) {
  return new Promise((resolve) => {
    if (map.loaded()) return resolve();
    map.once('idle', resolve);
  });
}

async function downloadDataURL(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
