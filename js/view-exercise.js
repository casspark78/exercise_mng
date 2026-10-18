import { getState, getList, upsertEntry, deleteEntry, weightForDate, exerciseKcal } from './state.js';
import {
  ROUTINE_TYPES, OTHER_TYPES, INTENSITIES, findType, calcKcal, effectiveMet, exerciseLabel,
  totalReps, totalVolume, estimateSetMinutes,
} from './met.js';
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
  const meta = [e.time, exerciseDetail(e)].filter(Boolean).join(' · ');
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

/** Most recent saved entry of a type, used to pre-fill a new record with last time's numbers. */
function lastEntryOf(typeId) {
  return getList('exercises').find((x) => x.typeId === typeId) || null;
}

function defaultsFor(typeId) {
  const last = lastEntryOf(typeId);
  const kind = findType(typeId).kind;
  if (last) {
    return {
      durationMin: last.durationMin,
      speedKmh: last.speedKmh,
      distanceKm: last.distanceKm,
      sets: last.sets ? last.sets.map((x) => ({ ...x })) : undefined,
      intensity: last.intensity,
    };
  }
  if (kind === 'treadmill') return { speedKmh: 6, distanceKm: 3, durationMin: 30 };
  if (kind === 'reps') return { sets: [{ reps: 20 }, { reps: 20 }, { reps: 20 }], durationMin: 6 };
  if (kind === 'weighted') return { sets: [{ kg: 20, reps: 10 }, { kg: 20, reps: 10 }, { kg: 20, reps: 10 }], durationMin: 6 };
  return { durationMin: 30 };
}

function setRowHtml(kind, set, i) {
  return `
    <div class="set-row" data-set>
      <div class="set-no">${i + 1}세트</div>
      ${kind === 'weighted' ? `<div class="set-input"><input type="number" inputmode="decimal" step="0.5" min="0" data-kg value="${set.kg ?? ''}"><span>kg</span></div><div class="set-x">×</div>` : ''}
      <div class="set-input"><input type="number" inputmode="numeric" min="0" data-reps value="${set.reps ?? ''}"><span>회</span></div>
      <button type="button" class="set-del" data-del-set aria-label="세트 삭제">✕</button>
    </div>`;
}

export function openExerciseForm(entry = null) {
  const isEdit = !!entry;
  const initialType = entry?.typeId || lastUsedType();
  const e = entry || {
    date: todayStr(),
    time: nowTimeStr(),
    typeId: initialType,
    intensity: 'normal',
    ...defaultsFor(initialType),
  };
  const isOther = (id) => !findType(id).routine;

  openEntrySheet(isEdit ? '운동 기록 수정' : '운동 기록 추가', (body, close) => {
    body.innerHTML = `
      <div class="type-grid">
        ${ROUTINE_TYPES.map((t) => `
          <button type="button" class="type-tile${t.id === e.typeId ? ' active' : ''}" data-type="${t.id}">
            <span class="ti">${t.icon}</span><span class="tn">${t.name}</span><span class="tc">${t.category}</span>
          </button>`).join('')}
        <button type="button" class="type-tile${isOther(e.typeId) ? ' active' : ''}" data-type="other">
          <span class="ti">➕</span><span class="tn">기타 운동</span><span class="tc">걷기·자전거 등</span>
        </button>
      </div>

      <div class="field other-only">
        <label>운동 종류</label>
        <select id="ex-type">
          ${OTHER_TYPES.map((t) => `<option value="${t.id}"${t.id === e.typeId ? ' selected' : ''}>${t.icon} ${t.name} (MET ${t.met})</option>`).join('')}
        </select>
      </div>
      <div class="field-row custom-only">
        <div class="field"><label>운동 이름</label><input type="text" id="ex-custom-name" placeholder="예: 탁구" value="${escapeHtml(e.customName || '')}"></div>
        <div class="field"><label>MET 값</label><input type="number" id="ex-custom-met" inputmode="decimal" step="0.1" min="1" max="20" value="${e.customMet || 4}"></div>
      </div>

      <div class="field-row">
        <div class="field"><label>날짜</label><input type="date" id="ex-date" value="${e.date}"></div>
        <div class="field"><label>시작 시간</label><input type="time" id="ex-time" value="${e.time || ''}"></div>
      </div>

      <div class="field-row three kind-treadmill">
        <div class="field"><label>속도 (km/h)</label><input type="number" id="ex-speed" inputmode="decimal" step="0.1" min="1" max="25" value="${e.speedKmh ?? ''}"></div>
        <div class="field"><label>거리 (km)</label><input type="number" id="ex-tm-distance" inputmode="decimal" step="0.01" min="0" value="${e.distanceKm ?? ''}"></div>
        <div class="field"><label>시간 (분)</label><input type="number" id="ex-tm-duration" inputmode="numeric" min="1" max="600" value="${e.durationMin ?? ''}"></div>
      </div>
      <div class="desc kind-treadmill" id="ex-tm-hint"></div>

      <div class="kind-sets">
        <div class="sets-head"><label id="ex-sets-label">세트</label><span id="ex-sets-total"></span></div>
        <div id="ex-sets"></div>
        <button type="button" class="btn btn-secondary btn-block add-set" id="ex-add-set">+ 세트 추가</button>
        <div class="field" style="margin-top:12px;">
          <label>총 운동 시간 (분, 휴식 포함)</label>
          <input type="number" id="ex-set-duration" inputmode="numeric" min="1" max="300" value="${e.durationMin ?? ''}">
        </div>
      </div>

      <div class="field-row kind-time">
        <div class="field"><label>운동 시간 (분)</label><input type="number" id="ex-duration" inputmode="numeric" min="1" max="600" value="${e.durationMin || ''}"></div>
        <div class="field distance-only"><label>거리 (km, 선택)</label><input type="number" id="ex-distance" inputmode="decimal" step="0.01" min="0" value="${e.distanceKm || ''}"></div>
      </div>

      <div class="field no-treadmill">
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
      <label class="check-row"><input type="checkbox" id="ex-kcal-manual"${e.kcalManual ? ' checked' : ''}> 칼로리 직접 입력 (스마트워치·기계 표시 값 등)</label>

      <div class="field"><label>메모</label><input type="text" id="ex-memo" placeholder="컨디션, 경사도 등" value="${escapeHtml(e.memo || '')}"></div>

      <div class="btn-row">
        ${isEdit ? '<button class="btn btn-danger" id="ex-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="ex-save">저장</button>
      </div>
    `;

    const $ = (id) => body.querySelector(id);
    const kcalInput = $('#ex-kcal');
    const manualBox = $('#ex-kcal-manual');
    const setsEl = $('#ex-sets');
    let typeId = e.typeId;
    // Once the user types a duration themselves we stop auto-filling it.
    let tmDurationTouched = isEdit;
    let setDurationTouched = isEdit;

    const kind = () => findType(typeId).kind || 'time';

    function renderSets(sets) {
      setsEl.innerHTML = sets.map((x, i) => setRowHtml(kind(), x, i)).join('');
    }

    function readSets() {
      return [...setsEl.querySelectorAll('[data-set]')].map((row) => {
        const set = { reps: Number(row.querySelector('[data-reps]').value) || 0 };
        const kg = row.querySelector('[data-kg]');
        if (kg) set.kg = Number(kg.value) || 0;
        return set;
      }).filter((x) => x.reps > 0);
    }

    function applyType(nextId, { prefill }) {
      typeId = nextId;
      body.querySelectorAll('.type-tile').forEach((b) => {
        b.classList.toggle('active', b.dataset.type === nextId || (b.dataset.type === 'other' && isOther(nextId)));
      });
      const k = kind();
      if (prefill) {
        const d = defaultsFor(nextId);
        if (k === 'treadmill') {
          $('#ex-speed').value = d.speedKmh ?? '';
          $('#ex-tm-distance').value = d.distanceKm ?? '';
          $('#ex-tm-duration').value = d.durationMin ?? '';
          tmDurationTouched = false;
        } else if (k === 'reps' || k === 'weighted') {
          renderSets(d.sets?.length ? d.sets : [{ reps: 10 }]);
          $('#ex-set-duration').value = d.durationMin ?? '';
          setDurationTouched = false;
        }
      } else if (k === 'reps' || k === 'weighted') {
        renderSets(e.sets && e.sets.length ? e.sets : [{ reps: 10, kg: 20 }]);
      }
      refresh();
    }

    function values() {
      const k = kind();
      const v = {
        date: $('#ex-date').value,
        time: $('#ex-time').value,
        typeId,
        intensity: segmentedValue(body, 'intensity') || 'normal',
        memo: $('#ex-memo').value.trim(),
      };
      if (k === 'treadmill') {
        v.speedKmh = Number($('#ex-speed').value) || null;
        v.distanceKm = Number($('#ex-tm-distance').value) || null;
        v.durationMin = Number($('#ex-tm-duration').value) || 0;
      } else if (k === 'reps' || k === 'weighted') {
        v.sets = readSets();
        v.durationMin = Number($('#ex-set-duration').value) || 0;
      } else {
        v.durationMin = Number($('#ex-duration').value) || 0;
        v.distanceKm = Number($('#ex-distance').value) || null;
        if (typeId === 'custom') {
          v.customName = $('#ex-custom-name').value.trim();
          v.customMet = Number($('#ex-custom-met').value) || null;
        }
      }
      return v;
    }

    function refresh() {
      const k = kind();
      const type = findType(typeId);
      const show = (sel, on) => body.querySelectorAll(sel).forEach((el) => el.classList.toggle('hidden', !on));
      show('.other-only', k === 'time');
      show('.custom-only', typeId === 'custom');
      show('.kind-treadmill', k === 'treadmill');
      show('.kind-sets', k === 'reps' || k === 'weighted');
      show('.kind-time', k === 'time');
      show('.no-treadmill', k !== 'treadmill');
      body.querySelectorAll('.distance-only').forEach((el) => el.classList.toggle('invisible', !type.distance));

      if (k === 'treadmill') {
        const speed = Number($('#ex-speed').value);
        const dist = Number($('#ex-tm-distance').value);
        if (!tmDurationTouched && speed && dist) $('#ex-tm-duration').value = Math.round((dist / speed) * 60);
        const dur = Number($('#ex-tm-duration').value);
        const pace = speed ? 60 / speed : 0;
        $('#ex-tm-hint').textContent = speed
          ? `페이스 ${Math.floor(pace)}분 ${String(Math.round((pace % 1) * 60)).padStart(2, '0')}초/km · ${speed < 7 ? '걷기' : '달리기'} 구간${dur && dist ? '' : ' · 거리 또는 시간을 입력하세요'}`
          : '속도와 거리를 입력하면 시간이 자동 계산돼요.';
      }
      if (k === 'reps' || k === 'weighted') {
        const sets = readSets();
        $('#ex-sets-label').textContent = k === 'weighted' ? '세트 (무게 × 횟수)' : '세트 (횟수)';
        $('#ex-sets-total').textContent = k === 'weighted'
          ? `총 ${totalReps(sets)}회 · 볼륨 ${totalVolume(sets).toLocaleString()}kg`
          : `총 ${totalReps(sets)}회`;
        if (!setDurationTouched) $('#ex-set-duration').value = estimateSetMinutes(sets) || '';
      }

      const v = values();
      const weightKg = weightForDate(v.date || todayStr());
      const met = effectiveMet(v);
      $('#ex-formula').textContent = `MET ${met.toFixed(1)} × ${weightKg}kg × ${(v.durationMin / 60).toFixed(2)}h`;
      kcalInput.readOnly = !manualBox.checked;
      if (!manualBox.checked) kcalInput.value = calcKcal({ ...v, weightKg });
    }

    body.querySelectorAll('.type-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.type === 'other' ? $('#ex-type').value : btn.dataset.type;
        if (next === typeId) return;
        applyType(next, { prefill: true });
      });
    });
    $('#ex-type').addEventListener('change', () => applyType($('#ex-type').value, { prefill: !isEdit }));

    $('#ex-add-set').addEventListener('click', () => {
      const sets = readSets();
      const last = sets[sets.length - 1] || (kind() === 'weighted' ? { kg: 20, reps: 10 } : { reps: 20 });
      renderSets([...sets, { ...last }]);
      refresh();
    });
    setsEl.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-del-set]')) return;
      ev.target.closest('[data-set]').remove();
      renderSets(readSets());
      refresh();
    });
    setsEl.addEventListener('input', refresh);

    $('#ex-tm-duration').addEventListener('input', () => { tmDurationTouched = true; refresh(); });
    $('#ex-set-duration').addEventListener('input', () => { setDurationTouched = true; refresh(); });
    ['#ex-date', '#ex-speed', '#ex-tm-distance', '#ex-duration', '#ex-distance', '#ex-custom-met']
      .forEach((id) => $(id).addEventListener('input', refresh));
    manualBox.addEventListener('change', refresh);
    bindSegmented(body, refresh);

    if (e.kcalManual && e.kcal != null) kcalInput.value = e.kcal;
    applyType(typeId, { prefill: false });

    $('#ex-save').addEventListener('click', () => {
      const v = values();
      const k = kind();
      if (!v.date) return toast('날짜를 입력해주세요.');
      if (k === 'treadmill' && (!v.speedKmh || !v.distanceKm)) return toast('속도와 거리를 입력해주세요.');
      if ((k === 'reps' || k === 'weighted') && !v.sets.length) return toast('세트별 횟수를 입력해주세요.');
      if (k === 'weighted' && v.sets.some((x) => !x.kg)) return toast('세트별 무게를 입력해주세요.');
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
    return localStorage.getItem('health_last_exercise_type') || 'treadmill';
  } catch {
    return 'treadmill';
  }
}

function rememberType(id) {
  try {
    localStorage.setItem('health_last_exercise_type', id);
  } catch { /* ignore */ }
}
