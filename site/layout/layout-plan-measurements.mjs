// Screen-space plan annotations; lengths always come from the saved mm outline.
// Shared by the editable preview and flat PNG export. No printer CAD is loaded.
const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const area = p => p.reduce((n, a, i) => { const b = p[(i + 1) % p.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0);

export function planMeasurementMarks({polygonMm, selectedPolygonMm, project, width, height, pixelScale = 1}) {
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0 || typeof project !== 'function') return [];
  const ui = Number.isFinite(pixelScale) ? Math.max(1, Math.min(8, pixelScale)) : 1;
  const marks = [];
  function edges(points, kind, offset, limit = points?.length) {
    if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return;
    const projected = points.map(p => project(...p));
    if (!projected.every(finitePoint)) return;
    const sign = area(projected) >= 0 ? 1 : -1;
    for (let i = 0; i < limit; i++) {
      const j = (i + 1) % points.length, a = projected[i], b = projected[j];
      const dx = b[0] - a[0], dy = b[1] - a[1], pixels = Math.hypot(dx, dy);
      if (pixels < 76 * ui) continue;
      const n = [sign * dy / pixels, -sign * dx / pixels];
      const middle = a.map((v, k) => (v + b[k]) / 2);
      let distance = offset;
      for (const [k, size, padding] of [[0, width, 20 * ui], [1, height, 14 * ui]]) {
        if (n[k] > 0) distance = Math.min(distance, (size - padding - middle[k]) / n[k]);
        if (n[k] < 0) distance = Math.min(distance, (padding - middle[k]) / n[k]);
      }
      // Small GPU-limited PNGs may have less than a text-height of outside
      // margin. Place that annotation inside the outline instead of losing it.
      if (distance < 4 * ui) distance = -18 * ui;
      const start = a.map((v, k) => v + n[k] * distance), end = b.map((v, k) => v + n[k] * distance);
      const label = start.map((v, k) => (v + end[k]) / 2);
      if (label[0] < 20 * ui || label[0] > width - 20 * ui || label[1] < 14 * ui || label[1] > height - 14 * ui) continue;
      marks.push({kind, start, end, label, tick: n, lengthMm: Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1])});
    }
  }
  edges(polygonMm, 'room', 25 * ui);
  // Two adjacent dimensions suffice for a rectangular furniture/printer envelope.
  if (selectedPolygonMm?.length === 4) edges(selectedPolygonMm, 'selected', 17 * ui, 2);
  const a = project(0, 0), b = project(1000, 0);
  if (finitePoint(a) && finitePoint(b)) {
    const pixelsPerMm = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000;
    if (Number.isFinite(pixelsPerMm) && pixelsPerMm > 0 && width >= 180 * ui && height >= 90 * ui) {
      const desired = 110 * ui / pixelsPerMm, base = 10 ** Math.floor(Math.log10(desired));
      const lengthMm = [1, 2, 5, 10].map(n => n * base).filter(n => n <= desired).at(-1);
      const start = [24 * ui, height - 24 * ui], end = [24 * ui + lengthMm * pixelsPerMm, height - 24 * ui];
      if (Number.isFinite(lengthMm) && lengthMm > 0) marks.push({kind: 'scale', start, end, tick: [0, 1], label: [(start[0] + end[0]) / 2, height - 38 * ui], lengthMm});
    }
  }
  return marks;
}

export function drawPlanMeasurements(ctx, options) {
  const marks = planMeasurementMarks(options), format = options.formatLength || (n => `${Math.round(n * 10) / 10} mm`);
  const ui = Number.isFinite(options.pixelScale) ? Math.max(1, Math.min(8, options.pixelScale)) : 1;
  ctx.save();
  ctx.font = `${12 * ui}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const m of marks) {
    const color = m.kind === 'selected' ? '#a44628' : '#415760';
    ctx.strokeStyle = color; ctx.lineWidth = (m.kind === 'scale' ? 2 : 1) * ui;
    ctx.beginPath(); ctx.moveTo(...m.start); ctx.lineTo(...m.end);
    for (const p of [m.start, m.end]) {
      ctx.moveTo(p[0] - m.tick[0] * 4 * ui, p[1] - m.tick[1] * 4 * ui);
      ctx.lineTo(p[0] + m.tick[0] * 4 * ui, p[1] + m.tick[1] * 4 * ui);
    }
    ctx.stroke();
    const text = format(m.lengthMm), tw = ctx.measureText?.(text)?.width ?? text.length * 7 * ui;
    if (tw + 12 * ui > options.width || options.height < 20 * ui) continue;
    const label = [Math.max(tw / 2 + 6 * ui, Math.min(options.width - tw / 2 - 6 * ui, m.label[0])), Math.max(10 * ui, Math.min(options.height - 10 * ui, m.label[1]))];
    ctx.fillStyle = '#f9fbfc'; ctx.fillRect(label[0] - tw / 2 - 5 * ui, label[1] - 9 * ui, tw + 10 * ui, 18 * ui);
    ctx.fillStyle = color; ctx.fillText(text, ...label);
  }
  ctx.restore();
  return marks;
}
