import { getState, getList, upsertEntry, deleteEntry } from './state.js';
import {
  openEntrySheet, toast, confirmAction, bindSegmented, rangePickerHtml, emptyStateHtml, showMoreHtml, PAGE_SIZE,
} from './components.js';
import { lineChart, movingAverage } from './charts.js';
import { todayStr, formatDateKr, escapeHtml, addDays, round1 } from './utils.js';

let range = '90';
let shown = PAGE_SIZE;

export function bmiInfo(kg, heightCm) {
  if (!kg || !heightCm) return null;
  const bmi = round1(kg / ((heightCm / 100) ** 2));
  // 대한비만학회 기준
  let label = '정상';
  let cls = 'good';
  if (bmi < 18.5) { label = '저체중'; cls = 'warn'; }
  else if (bmi >= 35) { label = '고도비만'; cls = 'bad'; }
  else if (bmi >= 30) { label = '2단계 비만'; cls = 'bad'; }
  else if (bmi >= 25) { label = '1단계 비만'; cls = 'warn'; }
  else if (bmi >= 23) { label = '비만 전단계'; cls = 'warn'; }
  return { bmi, label, cls };
}

/** Weight change over the last `days` days compared with the closest earlier weigh-in. */
export function weightChange(days) {
  const list = getList('weights');
  if (list.length < 2) return null;
  const latest = list[0];
  const cutoff = addDays(latest.date, -days);
  const base = list.find((w) => w.date <= cutoff) || list[list.length - 1];
  if (base === latest) return null;
  return round1(Number(latest.kg) - Number(base.kg));
}

export function filterByRange(list, r) {
  if (r === 'all') return list;
  const from = addDays(todayStr(), -Number(r));
  return list.filter((e) => e.date >= from);
}

function signed(n, unit = '') {
  if (n == null) return '-';
  return `${n > 0 ? '+' : ''}${n}${unit}`;
}

export function renderWeight(container) {
  const { profile } = getState().settings;
  const list = getList('weights');
  const latest = list[0];
  const bmi = latest ? bmiInfo(Number(latest.kg), Number(profile.heightCm)) : null;
  const change30 = weightChange(30);
  const goal = Number(profile.goalWeightKg) || null;

  container.innerHTML = `
    <div class="view-header-row">
      <div class="view-title">체중 관리</div>
      <button class="fab-inline" id="add-weight-btn">+ 체중 입력</button>
    </div>

    <div class="summary-grid">
      <div class="summary-tile"><div class="value neutral">${latest ? `${latest.kg}<small>kg</small>` : '-'}</div><div class="label">현재 체중</div></div>
      <div class="summary-tile"><div class="value ${change30 > 0 ? 'up' : change30 < 0 ? 'down' : 'neutral'}">${signed(change30, '')}<small>${change30 != null ? 'kg' : ''}</small></div><div class="label">30일 변화</div></div>
      <div class="summary-tile">
        <div class="value ${bmi ? bmi.cls : 'neutral'}">${bmi ? bmi.bmi : '-'}</div>
        <div class="label">BMI ${bmi ? `· ${bmi.label}` : profile.heightCm ? '' : '(키 설정 필요)'}</div>
      </div>
    </div>
    ${goal && latest ? `<div class="goal-line">🎯 목표 ${goal}kg까지 <b>${round1(Number(latest.kg) - goal) > 0 ? `${round1(Number(latest.kg) - goal)}kg 남음` : '목표 달성! 🎉'}</b></div>` : ''}

    <div class="card">
      <div class="card-head">
        <div class="card-title">체중 트렌드</div>
      </div>
      ${rangePickerHtml(range)}
      <div id="weight-chart">${chartHtml(list, goal)}</div>
    </div>

    <div class="section-title">전체 기록 <span class="count">${list.length}건</span></div>
    ${list.length ? `<div class="card list-card">${list.slice(0, shown).map((w, i) => rowHtml(w, list[i + 1])).join('')}</div>${showMoreHtml(list.length, shown)}` : emptyStateHtml('⚖️', '체중을 정기적으로 입력하면<br>트렌드를 확인할 수 있어요.')}
  `;

  container.querySelector('#add-weight-btn').addEventListener('click', () => openWeightForm());
  bindSegmented(container, (name, value) => {
    if (name !== 'range') return;
    range = value;
    container.querySelector('#weight-chart').innerHTML = chartHtml(list, goal);
  });
  container.querySelector('[data-show-more]')?.addEventListener('click', () => {
    shown += PAGE_SIZE * 2;
    renderWeight(container);
  });
  container.querySelectorAll('[data-weight-id]').forEach((row) => {
    row.addEventListener('click', () => openWeightForm(list.find((w) => w.id === row.dataset.weightId)));
  });
}

function chartHtml(list, goal) {
  const inRange = filterByRange(list, range);
  if (!inRange.length) return emptyStateHtml('📉', '이 기간에 기록이 없어요.');
  // One point per day (last weigh-in of the day) keeps the line readable.
  const perDay = new Map();
  [...inRange].reverse().forEach((w) => perDay.set(w.date, Number(w.kg)));
  const points = [...perDay].map(([date, y]) => ({ date, y }));
  const series = [{ name: '체중', color: 'var(--primary)', points }];
  if (points.length >= 5) series.push({ name: '7일 평균', color: 'var(--accent)', points: movingAverage(points, 7), dashed: true, dots: false });
  const refLines = goal ? [{ y: goal, color: 'var(--good)', label: `목표 ${goal}kg` }] : [];
  const ys = points.map((p) => p.y);
  const stats = `
    <div class="chart-stats">
      <span>최저 <b>${Math.min(...ys)}kg</b></span>
      <span>최고 <b>${Math.max(...ys)}kg</b></span>
      <span>평균 <b>${round1(ys.reduce((a, b) => a + b, 0) / ys.length)}kg</b></span>
    </div>`;
  return lineChart({ series, refLines, yPad: 0.5, unit: 'kg' }) + stats;
}

function rowHtml(w, prev) {
  const diff = prev ? round1(Number(w.kg) - Number(prev.kg)) : null;
  const sub = [w.bodyFat ? `체지방 ${w.bodyFat}%` : '', w.memo].filter(Boolean).join(' · ');
  return `
    <div class="list-row" data-weight-id="${w.id}">
      <div class="info">
        <div class="main">${formatDateKr(w.date)}</div>
        ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <div class="row-value">
        <b>${w.kg}</b><span>kg</span>
        ${diff != null && diff !== 0 ? `<em class="${diff > 0 ? 'up' : 'down'}">${signed(diff)}</em>` : ''}
      </div>
    </div>`;
}

export function openWeightForm(entry = null) {
  const isEdit = !!entry;
  const last = getList('weights')[0];
  const e = entry || { date: todayStr(), kg: last ? last.kg : getState().settings.profile.defaultWeightKg };

  openEntrySheet(isEdit ? '체중 수정' : '체중 입력', (body, close) => {
    body.innerHTML = `
      <div class="field"><label>날짜</label><input type="date" id="w-date" value="${e.date}"></div>
      <div class="field-row">
        <div class="field"><label>체중 (kg)</label><input type="number" id="w-kg" inputmode="decimal" step="0.1" min="20" max="300" value="${e.kg ?? ''}"></div>
        <div class="field"><label>체지방률 (%, 선택)</label><input type="number" id="w-fat" inputmode="decimal" step="0.1" min="1" max="70" value="${e.bodyFat ?? ''}"></div>
      </div>
      <div class="field"><label>메모</label><input type="text" id="w-memo" placeholder="공복, 운동 후 등" value="${escapeHtml(e.memo || '')}"></div>
      <div class="btn-row">
        ${isEdit ? '<button class="btn btn-danger" id="w-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="w-save">저장</button>
      </div>
    `;
    const $ = (id) => body.querySelector(id);
    setTimeout(() => $('#w-kg').select(), 250);

    $('#w-save').addEventListener('click', () => {
      const kg = round1(Number($('#w-kg').value));
      if (!$('#w-date').value) return toast('날짜를 입력해주세요.');
      if (!kg || kg < 20 || kg > 300) return toast('체중을 올바르게 입력해주세요.');
      try {
        upsertEntry('weights', {
          ...(isEdit ? { id: e.id } : {}),
          date: $('#w-date').value,
          kg,
          bodyFat: Number($('#w-fat').value) || null,
          memo: $('#w-memo').value.trim(),
        });
        toast(isEdit ? '수정되었습니다.' : '체중이 기록되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });

    $('#w-delete')?.addEventListener('click', () => {
      if (!confirmAction('이 체중 기록을 삭제할까요?')) return;
      try {
        deleteEntry('weights', e.id);
        toast('삭제되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });
  });
}
