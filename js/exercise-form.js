import { getList, replaceDayExercises, weightForDate } from './state.js';
import {
  ROUTINE_TYPES, OTHER_TYPES, findType, calcKcal, totalReps, totalVolume, estimateSetMinutes,
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
      sets: last.sets ? last.sets.map((x) => ({ ...x })) : undefined,
    };
  }
  if (kind === 'treadmill') return { speedKmh: 6, distanceKm: 3, durationMin: 30 };
  if (kind === 'reps') return { sets: [{ reps: 20 }, { reps: 20 }, { reps: 20 }], durationMin: 6 };
  return { sets: [{ kg: 20, reps: 10 }, { kg: 20, reps: 10 }, { kg: 20, reps: 10 }], durationMin: 6 };
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
      <div class="sets-head"><label>${type.kind === 'weighted' ? '세트 (무게 × 횟수)' : '세트 (횟수)'}</label><span data-sets-total></span></div>
      <div data-sets>${(data.sets?.length ? data.sets : [{ reps: 10 }]).map((x, i) => setRowHtml(type.kind, x, i)).join('')}</div>
      <button type="button" class="btn btn-secondary btn-block add-set" data-add-set>+ 세트 추가</button>
      <div class="field" style="margin-top:12px;">
        <label>총 운동 시간 (분, 휴식 포함)</label>
        <input type="number" inputmode="numeric" min="1" max="300" data-duration value="${data.durationMin ?? ''}">
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

export function openDayForm(date = todayStr()) {
  const existing = getList('exercises').filter((e) => e.date === date);
  const title = existing.length ? '운동 기록 수정' : date === todayStr() ? '오늘 운동 기록' : '운동 기록 추가';

  openEntrySheet(title, (body, close) => {
    const byType = new Map(existing.filter((e) => findType(e.typeId).routine).map((e) => [e.typeId, e]));
    const others = existing.filter((e) => !findType(e.typeId).routine);
    const memo = existing.find((e) => e.memo)?.memo || '';

    body.innerHTML = `
      <div class="field"><label>날짜</label><input type="date" id="day-date" value="${date}" max="${todayStr()}"></div>
      <div class="desc">${existing.length ? '이 날짜의 기록을 수정합니다.' : '오늘 한 운동을 켜고 값을 확인한 뒤 한 번에 저장하세요.'}</div>

      <div class="ex-sections">
        ${ROUTINE_TYPES.map((t) => routineSectionHtml(t, byType.get(t.id) || routineDefaults(t.id, date), byType.has(t.id))).join('')}
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

    function readSets(sec) {
      return [...sec.querySelectorAll('[data-set]')].map((row) => {
        const set = { reps: Number(row.querySelector('[data-reps]').value) || 0 };
        const kg = row.querySelector('[data-kg]');
        if (kg) set.kg = Number(kg.value) || 0;
        return set;
      }).filter((x) => x.reps > 0);
    }

    function sectionItem(sec) {
      const type = findType(sec.dataset.type);
      const item = { typeId: type.id, id: sec.dataset.id || undefined, intensity: 'normal' };
      if (type.kind === 'treadmill') {
        item.speedKmh = Number(sec.querySelector('[data-speed]').value) || null;
        item.distanceKm = Number(sec.querySelector('[data-distance]').value) || null;
      } else {
        item.sets = readSets(sec);
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
      } else {
        const sets = readSets(sec);
        sec.querySelector('[data-sets-total]').textContent = type.kind === 'weighted'
          ? `총 ${totalReps(sets)}회 · 볼륨 ${totalVolume(sets).toLocaleString()}kg`
          : `총 ${totalReps(sets)}회`;
        if (!sec.dataset.touched) durInput.value = estimateSetMinutes(sets) || '';
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
      const addSet = ev.target.closest('[data-add-set]');
      if (addSet) {
        const sec = addSet.closest('.ex-section');
        const kind = findType(sec.dataset.type).kind;
        const sets = readSets(sec);
        const last = sets[sets.length - 1] || (kind === 'weighted' ? { kg: 20, reps: 10 } : { reps: 20 });
        sec.querySelector('[data-sets]').innerHTML = [...sets, { ...last }].map((x, i) => setRowHtml(kind, x, i)).join('');
        refreshAll();
        return;
      }
      const delSet = ev.target.closest('[data-del-set]');
      if (delSet) {
        const sec = delSet.closest('.ex-section');
        delSet.closest('[data-set]').remove();
        sec.querySelector('[data-sets]').innerHTML = readSets(sec).map((x, i) => setRowHtml(findType(sec.dataset.type).kind, x, i)).join('');
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
        if ((type.kind === 'reps' || type.kind === 'weighted') && !it.sets.length) return toast(`${type.name} 세트별 횟수를 입력해주세요.`);
        if (type.kind === 'weighted' && it.sets.some((x) => !x.kg)) return toast(`${type.name} 세트별 무게를 입력해주세요.`);
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
