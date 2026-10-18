import { strToDate, formatMonthDay, escapeHtml } from './utils.js';

const W = 340;
const H = 190;
const PAD = { top: 14, right: 12, bottom: 24, left: 34 };

function niceStep(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  const step = n > 5 ? 10 : n > 2 ? 5 : n > 1 ? 2 : 1;
  return step * mag;
}

function yTicks(min, max) {
  const step = niceStep(max - min || 1, 4);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; ticks.length < 2 || ticks[ticks.length - 1] < max; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] };
}

/**
 * Time-series line chart as an inline SVG string.
 * series: [{ name, color, points: [{ date: 'YYYY-MM-DD', y }] , dashed? }]
 * refLines: [{ y, color, label }]
 */
export function lineChart({ series, refLines = [], yPad = 1, unit = '' }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return '';
  const ts = all.map((p) => strToDate(p.date).getTime());
  let tMin = Math.min(...ts);
  let tMax = Math.max(...ts);
  if (tMin === tMax) { tMin -= 86400000 * 3; tMax += 86400000 * 3; }

  const ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y)];
  const { ticks, lo, hi } = yTicks(Math.min(...ys) - yPad, Math.max(...ys) + yPad);

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (t) => PAD.left + ((t - tMin) / (tMax - tMin)) * iw;
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * ih;

  const grid = ticks.map((v) => `
    <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>
    <text x="${PAD.left - 6}" y="${y(v) + 3.5}" text-anchor="end" class="chart-axis">${v}</text>`).join('');

  const xLabelCount = 4;
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const t = tMin + ((tMax - tMin) * i) / (xLabelCount - 1);
    const d = new Date(t);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const anchor = i === 0 ? 'start' : i === xLabelCount - 1 ? 'end' : 'middle';
    return `<text x="${x(t)}" y="${H - 6}" text-anchor="${anchor}" class="chart-axis">${formatMonthDay(ds)}</text>`;
  }).join('');

  const refs = refLines.map((r) => `
    <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(r.y)}" y2="${y(r.y)}" stroke="${r.color}" stroke-dasharray="4 4" stroke-width="1.2" opacity="0.8"/>
    ${r.label ? `<text x="${W - PAD.right - 2}" y="${y(r.y) - 4}" text-anchor="end" class="chart-ref" fill="${r.color}">${escapeHtml(r.label)}</text>` : ''}`).join('');

  const lines = series.map((s) => {
    const pts = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(strToDate(p.date).getTime()).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    const dots = s.dots === false || pts.length > 60 ? '' : pts.map((p) => `<circle cx="${x(strToDate(p.date).getTime()).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="2.6" fill="${s.color}"><title>${formatMonthDay(p.date)} ${p.y}${unit}</title></circle>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5 4" opacity="0.85"' : ''}/>${dots}`;
  }).join('');

  const legend = series.length > 1 || refLines.length ? `
    <div class="chart-legend">
      ${series.map((s) => `<span><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('')}
    </div>` : '';

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
      ${grid}${refs}${lines}${xLabels}
    </svg>${legend}`;
}

/**
 * Simple vertical bar chart. bars: [{ label, value, highlight? }]
 */
export function barChart({ bars, goal = null, color = 'var(--primary)' }) {
  if (!bars.length) return '';
  const maxV = Math.max(...bars.map((b) => b.value), goal || 0, 1);
  const { ticks, hi } = yTicks(0, maxV);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + (1 - v / (hi || 1)) * ih;
  const slot = iw / bars.length;
  const bw = Math.min(28, slot * 0.62);

  const grid = ticks.map((v) => `
    <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/>
    <text x="${PAD.left - 6}" y="${y(v) + 3.5}" text-anchor="end" class="chart-axis">${v}</text>`).join('');

  const rects = bars.map((b, i) => {
    const cx = PAD.left + slot * i + slot / 2;
    const top = y(b.value);
    const h = Math.max(0, PAD.top + ih - top);
    return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}" opacity="${b.highlight ? 1 : 0.55}"><title>${escapeHtml(b.label)} ${b.value}</title></rect>
      <text x="${cx}" y="${H - 6}" text-anchor="middle" class="chart-axis">${escapeHtml(b.label)}</text>`;
  }).join('');

  const goalLine = goal ? `
    <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--warn)" stroke-dasharray="4 4" stroke-width="1.2"/>
    <text x="${W - PAD.right - 2}" y="${y(goal) - 4}" text-anchor="end" class="chart-ref" fill="var(--warn)">목표 ${goal}</text>` : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${rects}${goalLine}</svg>`;
}

/** Trailing moving average over the last `days` calendar days for each point. */
export function movingAverage(points, days = 7) {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((p) => {
    const t = strToDate(p.date).getTime();
    const win = sorted.filter((q) => {
      const tq = strToDate(q.date).getTime();
      return tq <= t && tq > t - days * 86400000;
    });
    const v = win.reduce((s, q) => s + q.y, 0) / win.length;
    return { date: p.date, y: Math.round(v * 10) / 10 };
  });
}
