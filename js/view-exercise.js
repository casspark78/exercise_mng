import { getState, getList, exerciseKcal } from './state.js';
import { EXERCISE_TYPES, INTENSITIES, findType, exerciseLabel, totalReps, totalVolume } from './met.js';
import { segmentedHtml, bindSegmented, emptyStateHtml, showMoreHtml, PAGE_SIZE } from './components.js';
import { openDayForm } from './exercise-form.js';
import { barChart } from './charts.js';
import {
  todayStr, formatDateKr, escapeHtml, addDays, weekStart, formatMonthDay, formatMinutes, strToDate,
} from './utils.js';

let chartMode = 'day';
let shown = PAGE_SIZE;

// Exercises are logged without a start time (it's a morning-workout log),
// so an entry counts as morning unless an older record says otherwise.
export function isMorning(entry) {
  return !entry.time || entry.time < '12:00';
}

/** Totals per date: { 'YYYY-MM-DD': { kcal, minutes, count } } */
export function dailyTotals() {
  const map = {};
  for (const e of getList('exercises')) {
    const t = map[e.date] || (map[e.date] = { kcal: 0, minutes: 0, count: 0, morning: false });
    t.kcal += exerciseKcal(e);
    t.minutes += Number(e.durationMin) || 0;
    t.count += 1;
    if (isMorning(e)) t.morning = true;
  }
  return map;
}

/** Consecutive days (ending today, or yesterday if today is not yet logged) with a morning workout. */
export function morningStreak() {
  const totals = dailyTotals();
  let day = todayStr();
  if (!totals[day]?.morning) day = addDays(day, -1);
  let n = 0;
  while (totals[day]?.morning) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function weekSummary(refDate = todayStr()) {
  const start = weekStart(refDate);
  const totals = dailyTotals();
  const sum = { kcal: 0, minutes: 0, count: 0, days: 0, morningDays: 0 };
  for (let i = 0; i < 7; i++) {
    const t = totals[addDays(start, i)];
    if (!t) continue;
    sum.kcal += t.kcal;
    sum.minutes += t.minutes;
    sum.count += t.count;
    sum.days += 1;
    if (t.morning) sum.morningDays += 1;
  }
  return sum;
}

export function renderExercise(container) {
  const list = getList('exercises');
  const days = new Set(list.map((e) => e.date));
  const week = weekSummary();
  const goal = Number(getState().settings.profile.dailyKcalGoal) || 0;

  container.innerHTML = `
    <div class="view-header-row">
      <div class="view-title">운동 기록</div>
      <button class="fab-inline" id="add-exercise-btn">${days.has(todayStr()) ? '오늘 기록 수정' : '+ 오늘 운동'}</button>
    </div>

    <div class="summary-grid">
      <div class="summary-tile"><div class="value">${week.kcal.toLocaleString()}</div><div class="label">이번 주 kcal</div></div>
      <div class="summary-tile"><div class="value neutral">${formatMinutes(week.minutes)}</div><div class="label">이번 주 운동시간</div></div>
      <div class="summary-tile"><div class="value neutral">${week.morningDays}<small>/7</small></div><div class="label">이번 주 운동 일수</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">소모 칼로리</div>
        ${segmentedHtml('chart', [{ id: 'day', name: '일별' }, { id: 'week', name: '주별' }, { id: 'month', name: '월별' }], chartMode)}
      </div>
      <div id="exercise-chart">${kcalChartHtml(chartMode, goal)}</div>
    </div>

    <div class="section-title">전체 기록 <span class="count">${days.size}일</span></div>
    <div id="exercise-list">${list.length ? groupedListHtml(list, shown) + showMoreHtml(days.size, shown) : emptyStateHtml('🏃', '아직 운동 기록이 없어요.<br>오늘 아침 운동을 기록해보세요!')}</div>
  `;

  container.querySelector('#add-exercise-btn').addEventListener('click', () => openDayForm(todayStr()));
  bindSegmented(container, (name, value) => {
    if (name !== 'chart') return;
    chartMode = value;
    container.querySelector('#exercise-chart').innerHTML = kcalChartHtml(chartMode, goal);
  });
  container.querySelector('[data-show-more]')?.addEventListener('click', () => {
    shown += PAGE_SIZE * 2;
    renderExercise(container);
  });
  container.querySelectorAll('[data-day]').forEach((el) => {
    el.addEventListener('click', () => openDayForm(el.dataset.day));
  });
}

function kcalChartHtml(mode, goal) {
  const totals = dailyTotals();
  const today = todayStr();
  let bars = [];
  if (mode === 'day') {
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      bars.push({ label: i % 2 === 0 ? formatMonthDay(d) : '', value: totals[d]?.kcal || 0, highlight: i === 0 });
    }
    return barChart({ bars, goal: goal || null });
  }
  if (mode === 'week') {
    const thisWeek = weekStart(today);
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(thisWeek, -7 * i);
      let v = 0;
      for (let k = 0; k < 7; k++) v += totals[addDays(ws, k)]?.kcal || 0;
      bars.push({ label: formatMonthDay(ws), value: v, highlight: i === 0 });
    }
    return barChart({ bars, goal: goal ? goal * 7 : null });
  }
  const now = strToDate(today);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const v = Object.entries(totals).filter(([k]) => k.startsWith(prefix)).reduce((s, [, t]) => s + t.kcal, 0);
    bars.push({ label: `${d.getMonth() + 1}월`, value: v, highlight: i === 0 });
  }
  return barChart({ bars });
}

export function exerciseDetail(e) {
  const type = findType(e.typeId);
  const dur = formatMinutes(Number(e.durationMin) || 0);
  if (type.kind === 'treadmill') {
    return [e.speedKmh ? `${e.speedKmh}km/h` : '', e.distanceKm ? `${e.distanceKm}km` : '', dur].filter(Boolean).join(' · ');
  }
  if (type.kind === 'reps') {
    const sets = e.sets || [];
    return `${sets.length}세트 · 총 ${totalReps(sets)}회 (${sets.map((x) => x.reps).join('/')})`;
  }
  if (type.kind === 'weighted') {
    const sets = e.sets || [];
    const same = sets.length && sets.every((x) => x.kg === sets[0].kg && x.reps === sets[0].reps);
    const detail = same
      ? `${sets[0].kg}kg × ${sets[0].reps}회 × ${sets.length}세트`
      : sets.map((x) => `${x.kg}×${x.reps}`).join(', ');
    return `${detail} · 볼륨 ${totalVolume(sets).toLocaleString()}kg`;
  }
  return [
    dur,
    e.distanceKm ? `${e.distanceKm}km` : '',
    INTENSITIES.find((i) => i.id === e.intensity)?.name || '',
  ].filter(Boolean).join(' · ');
}

export function exerciseRowHtml(e) {
  const type = findType(e.typeId);
  const kcal = exerciseKcal(e);
  const meta = exerciseDetail(e);
  return `
    <div class="list-row">
      <div class="row-icon">${type.icon}</div>
      <div class="info">
        <div class="main">${escapeHtml(exerciseLabel(e))}</div>
        <div class="sub">${escapeHtml(meta)}</div>
      </div>
      <div class="row-value"><b>${kcal.toLocaleString()}</b><span>kcal</span></div>
    </div>`;
}

/** One card per day (the day's workout record); `limit` counts days. */
function groupedListHtml(list, limit = Infinity) {
  const groups = [];
  for (const e of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return groups.slice(0, limit).map((g) => dayCardHtml(g.date, g.items)).join('');
}

const TYPE_ORDER = new Map(EXERCISE_TYPES.map((t, i) => [t.id, i]));

export function dayCardHtml(date, dayItems) {
  const items = [...dayItems].sort((a, b) => (TYPE_ORDER.get(a.typeId) ?? 99) - (TYPE_ORDER.get(b.typeId) ?? 99));
  const total = items.reduce((s, e) => s + exerciseKcal(e), 0);
  const memo = items.find((e) => e.memo)?.memo;
  return `
    <div class="date-group" data-day="${date}">
      <div class="date-group-head"><span>${formatDateKr(date)}</span><span>${total.toLocaleString()} kcal ›</span></div>
      <div class="card list-card">
        ${items.map(exerciseRowHtml).join('')}
        ${memo ? `<div class="day-memo">📝 ${escapeHtml(memo)}</div>` : ''}
      </div>
    </div>`;
}
