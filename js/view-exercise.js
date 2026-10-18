import { getState, getList, upsertEntry, deleteEntry, weightForDate, exerciseKcal } from './state.js';
import { EXERCISE_TYPES, INTENSITIES, findType, calcKcal, effectiveMet, exerciseLabel } from './met.js';
import {
  openEntrySheet, toast, confirmAction, segmentedHtml, bindSegmented, segmentedValue, emptyStateHtml,
  showMoreHtml, PAGE_SIZE,
} from './components.js';
import { barChart } from './charts.js';
import {
  todayStr, nowTimeStr, formatDateKr, escapeHtml, addDays, weekStart, formatMonthDay, formatMinutes, strToDate,
} from './utils.js';

let chartMode = 'day';
let shown = PAGE_SIZE;

export function isMorning(entry) {
  return !!entry.time && entry.time < '12:00';
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
  const week = weekSummary();
  const goal = Number(getState().settings.profile.dailyKcalGoal) || 0;

  container.innerHTML = `
    <div class="view-header-row">
      <div class="view-title">운동 기록</div>
      <button class="fab-inline" id="add-exercise-btn">+ 운동 추가</button>
    </div>

    <div class="summary-grid">
      <div class="summary-tile"><div class="value">${week.kcal.toLocaleString()}</div><div class="label">이번 주 kcal</div></div>
      <div class="summary-tile"><div class="value neutral">${formatMinutes(week.minutes)}</div><div class="label">이번 주 운동시간</div></div>
      <div class="summary-tile"><div class="value neutral">${week.morningDays}<small>/7</small></div><div class="label">아침 운동 일수</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">소모 칼로리</div>
        ${segmentedHtml('chart', [{ id: 'day', name: '일별' }, { id: 'week', name: '주별' }, { id: 'month', name: '월별' }], chartMode)}
      </div>
      <div id="exercise-chart">${kcalChartHtml(chartMode, goal)}</div>
    </div>

    <div class="section-title">전체 기록 <span class="count">${list.length}건</span></div>
    <div id="exercise-list">${list.length ? groupedListHtml(list.slice(0, shown)) + showMoreHtml(list.length, shown) : emptyStateHtml('🏃', '아직 운동 기록이 없어요.<br>오늘 아침 운동을 기록해보세요!')}</div>
  `;

  container.querySelector('#add-exercise-btn').addEventListener('click', () => openExerciseForm());
  bindSegmented(container, (name, value) => {
    if (name !== 'chart') return;
    chartMode = value;
    container.querySelector('#exercise-chart').innerHTML = kcalChartHtml(chartMode, goal);
  });
  container.querySelector('[data-show-more]')?.addEventListener('click', () => {
    shown += PAGE_SIZE * 2;
    renderExercise(container);
  });
  container.querySelectorAll('[data-exercise-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const entry = list.find((e) => e.id === row.dataset.exerciseId);
      if (entry) openExerciseForm(entry);
    });
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

export function exerciseRowHtml(e) {
  const type = findType(e.typeId);
  const kcal = exerciseKcal(e);
  const meta = [
    e.time ? `${e.time}` : '',
    formatMinutes(Number(e.durationMin) || 0),
    e.distanceKm ? `${e.distanceKm}km` : '',
    INTENSITIES.find((i) => i.id === e.intensity)?.name || '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="list-row" data-exercise-id="${e.id}">
      <div class="row-icon">${type.icon}</div>
      <div class="info">
        <div class="main">${escapeHtml(exerciseLabel(e))}${isMorning(e) ? ' <span class="tag">아침</span>' : ''}</div>
        <div class="sub">${escapeHtml(meta)}</div>
        ${e.memo ? `<div class="memo">${escapeHtml(e.memo)}</div>` : ''}
      </div>
      <div class="row-value"><b>${kcal.toLocaleString()}</b><span>kcal</span></div>
    </div>`;
}

function groupedListHtml(list) {
  const groups = [];
  for (const e of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return groups.map((g) => {
    const total = g.items.reduce((s, e) => s + exerciseKcal(e), 0);
    return `
      <div class="date-group">
        <div class="date-group-head"><span>${formatDateKr(g.date)}</span><span>${total.toLocaleString()} kcal</span></div>
        <div class="card list-card">${g.items.map(exerciseRowHtml).join('')}</div>
      </div>`;
  }).join('');
}

export function openExerciseForm(entry = null) {
  const isEdit = !!entry;
  const e = entry || {
    date: todayStr(),
    time: nowTimeStr(),
    typeId: lastUsedType(),
    durationMin: 30,
    intensity: 'normal',
  };

  openEntrySheet(isEdit ? '운동 기록 수정' : '운동 기록 추가', (body, close) => {
    body.innerHTML = `
      <div class="field-row">
        <div class="field"><label>날짜</label><input type="date" id="ex-date" value="${e.date}"></div>
        <div class="field"><label>시작 시간</label><input type="time" id="ex-time" value="${e.time || ''}"></div>
      </div>
      <div class="field">
        <label>운동 종류</label>
        <select id="ex-type">
          ${EXERCISE_TYPES.map((t) => `<option value="${t.id}"${t.id === e.typeId ? ' selected' : ''}>${t.icon} ${t.name} (MET ${t.met})</option>`).join('')}
        </select>
      </div>
      <div class="field-row custom-only">
        <div class="field"><label>운동 이름</label><input type="text" id="ex-custom-name" placeholder="예: 탁구" value="${escapeHtml(e.customName || '')}"></div>
        <div class="field"><label>MET 값</label><input type="number" id="ex-custom-met" inputmode="decimal" step="0.1" min="1" max="20" value="${e.customMet || 4}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>운동 시간 (분)</label><input type="number" id="ex-duration" inputmode="numeric" min="1" max="600" value="${e.durationMin || ''}"></div>
        <div class="field distance-only"><label>거리 (km, 선택)</label><input type="number" id="ex-distance" inputmode="decimal" step="0.01" min="0" value="${e.distanceKm || ''}"></div>
      </div>
      <div class="field">
        <label>강도</label>
        ${segmentedHtml('intensity', INTENSITIES, e.intensity || 'normal')}
      </div>

      <div class="kcal-box">
        <div>
          <div class="kcal-label">예상 소모 칼로리</div>
          <div class="kcal-formula" id="ex-formula"></div>
        </div>
        <div class="kcal-value"><input type="number" id="ex-kcal" inputmode="numeric" min="0"><span>kcal</span></div>
      </div>
      <label class="check-row"><input type="checkbox" id="ex-kcal-manual"${e.kcalManual ? ' checked' : ''}> 칼로리 직접 입력 (스마트워치 값 등)</label>

      <div class="field"><label>메모</label><input type="text" id="ex-memo" placeholder="컨디션, 코스 등" value="${escapeHtml(e.memo || '')}"></div>

      <div class="btn-row">
        ${isEdit ? '<button class="btn btn-danger" id="ex-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="ex-save">저장</button>
      </div>
    `;

    const $ = (id) => body.querySelector(id);
    const kcalInput = $('#ex-kcal');
    const manualBox = $('#ex-kcal-manual');

    function values() {
      return {
        date: $('#ex-date').value,
        time: $('#ex-time').value,
        typeId: $('#ex-type').value,
        customName: $('#ex-custom-name').value.trim(),
        customMet: Number($('#ex-custom-met').value) || null,
        durationMin: Number($('#ex-duration').value) || 0,
        distanceKm: Number($('#ex-distance').value) || null,
        intensity: segmentedValue(body, 'intensity') || 'normal',
        memo: $('#ex-memo').value.trim(),
      };
    }

    function refresh() {
      const v = values();
      const type = findType(v.typeId);
      body.querySelectorAll('.custom-only').forEach((el) => el.classList.toggle('hidden', v.typeId !== 'custom'));
      body.querySelectorAll('.distance-only').forEach((el) => el.classList.toggle('invisible', !type.distance));
      const weightKg = weightForDate(v.date || todayStr());
      const met = effectiveMet(v);
      $('#ex-formula').textContent = `MET ${met.toFixed(1)} × ${weightKg}kg × ${(v.durationMin / 60).toFixed(2)}h`;
      kcalInput.readOnly = !manualBox.checked;
      if (!manualBox.checked) kcalInput.value = calcKcal({ ...v, weightKg });
    }

    if (e.kcalManual && e.kcal != null) kcalInput.value = e.kcal;
    ['#ex-date', '#ex-type', '#ex-duration', '#ex-custom-met'].forEach((id) => $(id).addEventListener('input', refresh));
    manualBox.addEventListener('change', refresh);
    bindSegmented(body, refresh);
    refresh();

    $('#ex-save').addEventListener('click', () => {
      const v = values();
      if (!v.date) return toast('날짜를 입력해주세요.');
      if (!v.durationMin) return toast('운동 시간을 입력해주세요.');
      const weightKg = weightForDate(v.date);
      const manual = manualBox.checked;
      try {
        upsertEntry('exercises', {
          ...(isEdit ? { id: e.id } : {}),
          ...v,
          weightKg,
          kcalManual: manual,
          kcal: manual ? Number(kcalInput.value) || 0 : calcKcal({ ...v, weightKg }),
        });
        rememberType(v.typeId);
        toast(isEdit ? '수정되었습니다.' : '운동이 기록되었습니다. 💪');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });

    $('#ex-delete')?.addEventListener('click', () => {
      if (!confirmAction('이 운동 기록을 삭제할까요?')) return;
      try {
        deleteEntry('exercises', e.id);
        toast('삭제되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });
  });
}

function lastUsedType() {
  try {
    return localStorage.getItem('health_last_exercise_type') || 'brisk_walk';
  } catch {
    return 'brisk_walk';
  }
}

function rememberType(id) {
  try {
    localStorage.setItem('health_last_exercise_type', id);
  } catch { /* ignore */ }
}
