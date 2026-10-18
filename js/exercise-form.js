import { getList, replaceDayExercises, weightForDate } from './state.js';
import {
  ROUTINE_TYPES, OTHER_TYPES, findType, calcKcal, entryReps, entryKg,
} from './met.js';
import { openEntrySheet, toast, confirmAction } from './components.js';
import { todayStr, formatDateKr, escapeHtml } from './utils.js';

/**
 * One workout record per day: a single sheet holds every exercise done on a
 * date and one save replaces that day's entries. Opening a date that already
 * has a record edits it instead of adding another.
 */

/** Most recent saved entry of a type before `date`, used to pre-fill with last time's numbers. */
function lastEntryOf(typeId, date) {
  return getList('exercises').find((x) => x.typeId === typeId && x.date !== date) || null;
}

function routineDefaults(typeId, date) {
  const last = lastEntryOf(typeId, date);
  const kind = findType(typeId).kind;
  if (last) {
    return {
      speedKmh: last.speedKmh,
      distanceKm: last.distanceKm,
      durationMin: last.durationMin,
      reps: entryReps(last) || undefined,
      kg: entryKg(last) || undefined,
    };
  }
  if (kind === 'treadmill') return { speedKmh: 6, distanceKm: 3, durationMin: 30 };
  if (kind === 'reps') return { reps: 50, durationMin: 10 };
  return { kg: 20, reps: 30, durationMin: 10 };
}

function routineSectionHtml(type, data, done) {
  const body = type.kind === 'treadmill'
    ? `
      <div class="field-row three">
        <div class="field"><label>속도 (km/h)</label><input type="number" inputmode="decimal" step="0.1" min="1" max="25" data-speed value="${data.speedKmh ?? ''}"></div>
        <div class="field"><label>거리 (km)</label><input type="number" inputmode="decimal" step="0.01" min="0" data-distance value="${data.distanceKm ?? ''}"></div>
        <div class="field"><label>시간 (분)</label><input type="number" inputmode="numeric" min="1" max="600" data-duration value="${data.durationMin ?? ''}"></div>
      </div>
      <div class="desc" data-hint></div>`
    : `
      <div class="field-row${type.kind === 'weighted' ? ' three' : ''}">
        ${type.kind === 'weighted' ? `<div class="field"><label>무게 (kg)</label><input type="number" inputmode="decimal" step="0.5" min="0" data-kg value="${data.kg ?? ''}"></div>` : ''}
        <div class="field"><label>횟수 (회)</label><input type="number" inputmode="numeric" min="1" data-reps value="${data.reps ?? ''}"></div>
        <div class="field"><label>시간 (분)</label><input type="number" inputmode="numeric" min="1" max="300" data-duration value="${data.durationMin ?? ''}"></div>
      </div>`;
  return `
    <div class="ex-section${done ? ' on' : ''}" data-type="${type.id}" data-id="${data.id || ''}" data-touched="${data.id ? '1' : ''}">
      <button type="button" class="ex-sec-head" data-toggle>
        <span class="ti">${type.icon}</span>
        <span class="tt"><span class="tn">${type.name}</span><span class="tc">${type.category}</span></span>
        <span class="ex-sec-kcal" data-kcal></span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      <div class="ex-sec-body">${body}</div>
    </div>`;
}

function otherRowHtml(entry = {}) {
  const typeId = entry.typeId || 'walk';
  return `
    <div class="other-row" data-other data-id="${entry.id || ''}" data-intensity="${entry.intensity || 'normal'}" data-custom-met="${entry.customMet || ''}" data-custom-name="${escapeHtml(entry.customName || '')}">
      <select data-other-type>
        ${OTHER_TYPES.map((t) => `<option value="${t.id}"${t.id === typeId ? ' selected' : ''}>${t.icon} ${t.name}</option>`).join('')}
      </select>
      <div class="set-input"><input type="number" inputmode="numeric" min="1" max="600" data-other-duration value="${entry.durationMin ?? 30}"><span>분</span></div>
      <button type="button" class="set-del" data-del-other aria-label="삭제">✕</button>
    </div>`;
}

/** Most recent workout day before `date`, or null. */
export function lastWorkoutDate(date = todayStr()) {
  return getList('exercises').find((e) => e.date < date)?.date || null;
}

/**
 * `copyFrom`: a date whose exercises pre-fill the sheet ("지난번과 똑같이").
 * Copied items carry no id, so saving replaces the day with new entries.
 */
export function openDayForm(date = todayStr(), { copyFrom = null } = {}) {
  const existing = getList('exercises').filter((e) => e.date === date);
  const title = existing.length ? '운동 기록 수정' : date === todayStr() ? '오늘 운동 기록' : '운동 기록 추가';
  const copying = !!copyFrom;
  const source = copying
    ? getList('exercises').filter((e) => e.date === copyFrom).map(({ id, memo: _memo, ...rest }) => rest)
    : existing;
  const prevDay = lastWorkoutDate(date);

  openEntrySheet(title, (body, close) => {
    const byType = new Map(source.filter((e) => findType(e.typeId).routine).map((e) => [e.typeId, e]));
    const others = source.filter((e) => !findType(e.typeId).routine);
    const memo = existing.find((e) => e.memo)?.memo || '';

    body.innerHTML = `
      <div class="field"><label>날짜</label><input type="date" id="day-date" value="${date}" max="${todayStr()}"></div>
      <div class="desc">${copying ? `${formatDateKr(copyFrom)} 기록을 불러왔어요. 바뀐 값만 고치고 저장하세요.` : existing.length ? '이 날짜의 기록을 수정합니다.' : '오늘 한 운동을 켜고 값을 확인한 뒤 한 번에 저장하세요.'}</div>
      ${prevDay && !copying ? `<button type="button" class="btn btn-secondary btn-block copy-last" id="copy-last">↺ 지난번과 똑같이 <small>(${formatDateKr(prevDay)})</small></button>` : ''}

      <div class="ex-sections">
        ${ROUTINE_TYPES.map((t) => {
          const saved = byType.get(t.id);
          const data = saved ? { ...saved, reps: entryReps(saved) || undefined, kg: entryKg(saved) || undefined } : routineDefaults(t.id, date);
          return routineSectionHtml(t, data, !!saved);
        }).join('')}
      </div>

      <div class="sets-head" style="margin-top:16px;"><label>기타 운동</label><span data-other-total></span></div>
      <div id="other-rows">${others.map(otherRowHtml).join('')}</div>
      <button type="button" class="btn btn-secondary btn-block add-set" id="add-other">+ 기타 운동 추가</button>

      <div class="field" style="margin-top:16px;"><label>메모</label><input type="text" id="day-memo" placeholder="컨디션, 경사도 등" value="${escapeHtml(memo)}"></div>

      <div class="kcal-box">
        <div>
          <div class="kcal-label">오늘 총 소모 칼로리</div>
          <div class="kcal-formula" id="day-formula"></div>
        </div>
        <div class="kcal-value"><b id="day-kcal">0</b><span>kcal</span></div>
      </div>

      <div class="btn-row">
        ${existing.length ? '<button class="btn btn-danger" id="day-delete">기록 삭제</button>' : ''}
        <button class="btn btn-primary" id="day-save">저장</button>
      </div>
    `;

    const $ = (sel) => body.querySelector(sel);
    const weightKg = () => weightForDate($('#day-date').value || date);

    function sectionItem(sec) {
      const type = findType(sec.dataset.type);
      const item = { typeId: type.id, id: sec.dataset.id || undefined, intensity: 'normal' };
      if (type.kind === 'treadmill') {
        item.speedKmh = Number(sec.querySelector('[data-speed]').value) || null;
        item.distanceKm = Number(sec.querySelector('[data-distance]').value) || null;
      } else {
        item.reps = Number(sec.querySelector('[data-reps]').value) || 0;
        if (type.kind === 'weighted') item.kg = Number(sec.querySelector('[data-kg]').value) || 0;
      }
      item.durationMin = Number(sec.querySelector('[data-duration]').value) || 0;
      return item;
    }

    function otherItem(row) {
      const item = {
        typeId: row.querySelector('[data-other-type]').value,
        id: row.dataset.id || undefined,
        intensity: row.dataset.intensity || 'normal',
        durationMin: Number(row.querySelector('[data-other-duration]').value) || 0,
      };
      if (item.typeId === 'custom') {
        item.customMet = Number(row.dataset.customMet) || null;
        item.customName = row.dataset.customName || '';
      }
      return item;
    }

    function refreshSection(sec) {
      const type = findType(sec.dataset.type);
      const durInput = sec.querySelector('[data-duration]');
      if (type.kind === 'treadmill') {
        const speed = Number(sec.querySelector('[data-speed]').value);
        const dist = Number(sec.querySelector('[data-distance]').value);
        if (!sec.dataset.touched && speed && dist) durInput.value = Math.round((dist / speed) * 60);
        const pace = speed ? 60 / speed : 0;
        sec.querySelector('[data-hint]').textContent = speed
          ? `페이스 ${Math.floor(pace)}분 ${String(Math.round((pace % 1) * 60)).padStart(2, '0')}초/km · ${speed < 7 ? '걷기' : '달리기'} 구간`
          : '속도와 거리를 입력하면 시간이 자동 계산돼요.';
      }
      const kcal = calcKcal({ ...sectionItem(sec), weightKg: weightKg() });
      sec.querySelector('[data-kcal]').textContent = sec.classList.contains('on') ? `${kcal} kcal` : '';
    }

    function collect() {
      const items = [];
      body.querySelectorAll('.ex-section.on').forEach((sec) => items.push(sectionItem(sec)));
      body.querySelectorAll('[data-other]').forEach((row) => items.push(otherItem(row)));
      return items;
    }

    function refreshAll() {
      body.querySelectorAll('.ex-section').forEach(refreshSection);
      const w = weightKg();
      const items = collect();
      const total = items.reduce((s, it) => s + calcKcal({ ...it, weightKg: w }), 0);
      const minutes = items.reduce((s, it) => s + (it.durationMin || 0), 0);
      const otherKcal = [...body.querySelectorAll('[data-other]')].reduce((s, row) => s + calcKcal({ ...otherItem(row), weightKg: w }), 0);
      $('[data-other-total]').textContent = otherKcal ? `${otherKcal} kcal` : '';
      $('#day-kcal').textContent = total.toLocaleString();
      $('#day-formula').textContent = items.length ? `${items.length}개 운동 · ${minutes}분 · 체중 ${w}kg 기준` : '운동을 하나 이상 켜주세요';
    }

    body.addEventListener('click', (ev) => {
      const toggle = ev.target.closest('[data-toggle]');
      if (toggle) {
        toggle.closest('.ex-section').classList.toggle('on');
        refreshAll();
        return;
      }
      const delOther = ev.target.closest('[data-del-other]');
      if (delOther) {
        delOther.closest('[data-other]').remove();
        refreshAll();
      }
    });

    body.addEventListener('input', (ev) => {
      if (ev.target.matches('[data-duration]')) ev.target.closest('.ex-section').dataset.touched = '1';
      if (ev.target.id === 'day-date') return;
      refreshAll();
    });
    body.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-other-type]')) refreshAll();
    });

    // Switching the date opens that day's record (or a fresh one), so a day never gets two.
    $('#day-date').addEventListener('change', (ev) => {
      const next = ev.target.value;
      if (!next || next === date) return;
      if (next > todayStr()) {
        toast('미래 날짜는 기록할 수 없어요.');
        ev.target.value = date;
        return;
      }
      close();
      setTimeout(() => openDayForm(next), 0);
    });

    $('#copy-last')?.addEventListener('click', () => {
      close();
      setTimeout(() => openDayForm(date, { copyFrom: prevDay }), 0);
    });

    $('#add-other').addEventListener('click', () => {
      $('#other-rows').insertAdjacentHTML('beforeend', otherRowHtml());
      refreshAll();
    });

    refreshAll();

    $('#day-save').addEventListener('click', () => {
      const items = collect();
      if (!items.length) return toast('오늘 한 운동을 하나 이상 켜주세요.');
      for (const it of items) {
        const type = findType(it.typeId);
        if (type.kind === 'treadmill' && (!it.speedKmh || !it.distanceKm)) return toast('런닝머신 속도와 거리를 입력해주세요.');
        if ((type.kind === 'reps' || type.kind === 'weighted') && !it.reps) return toast(`${type.name} 횟수를 입력해주세요.`);
        if (type.kind === 'weighted' && !it.kg) return toast(`${type.name} 무게를 입력해주세요.`);
        if (!it.durationMin) return toast(`${type.name} 운동 시간을 입력해주세요.`);
      }
      const w = weightForDate(date);
      const memoText = $('#day-memo').value.trim();
      try {
        replaceDayExercises(date, items.map((it) => ({
          ...it,
          weightKg: w,
          kcalManual: false,
          kcal: calcKcal({ ...it, weightKg: w }),
          memo: memoText,
        })));
        toast(existing.length ? '수정되었습니다.' : `${formatDateKr(date)} 운동이 기록되었습니다. 💪`);
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });

    $('#day-delete')?.addEventListener('click', () => {
      if (!confirmAction(`${formatDateKr(date)} 운동 기록을 삭제할까요?`)) return;
      try {
        replaceDayExercises(date, []);
        toast('삭제되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });
  });
}
