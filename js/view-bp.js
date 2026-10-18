import { getList, upsertEntry, deleteEntry } from './state.js';
import {
  openEntrySheet, toast, confirmAction, bindSegmented, rangePickerHtml, emptyStateHtml, showMoreHtml, PAGE_SIZE,
} from './components.js';
import { lineChart } from './charts.js';
import { todayStr, nowTimeStr, formatDateKr, escapeHtml, avg } from './utils.js';
import { filterByRange } from './view-weight.js';

let range = '90';
let shown = PAGE_SIZE;

/** 대한고혈압학회 2022 진료지침 분류 */
export function classifyBp(sys, dia) {
  if (sys >= 160 || dia >= 100) return { label: '2기 고혈압', cls: 'bad' };
  if (sys >= 140 || dia >= 90) return { label: '1기 고혈압', cls: 'bad' };
  if (sys >= 130 || dia >= 80) return { label: '고혈압 전단계', cls: 'warn' };
  if (sys >= 120) return { label: '주의혈압', cls: 'warn' };
  if (sys < 90 || dia < 60) return { label: '저혈압 주의', cls: 'warn' };
  return { label: '정상', cls: 'good' };
}

export function isMorningTime(time) {
  return !!time && time < '12:00';
}

function averageOf(list) {
  if (!list.length) return null;
  return {
    sys: Math.round(avg(list.map((b) => Number(b.sys)))),
    dia: Math.round(avg(list.map((b) => Number(b.dia)))),
    pulse: list.some((b) => b.pulse) ? Math.round(avg(list.filter((b) => b.pulse).map((b) => Number(b.pulse)))) : null,
    count: list.length,
  };
}

export function renderBp(container) {
  const list = getList('bps');
  const latest = list[0];
  const latestCls = latest ? classifyBp(Number(latest.sys), Number(latest.dia)) : null;

  container.innerHTML = `
    <div class="view-header-row">
      <div class="view-title">혈압 관리</div>
      <button class="fab-inline" id="add-bp-btn">+ 혈압 입력</button>
    </div>

    ${latest ? `
    <div class="card bp-latest">
      <div>
        <div class="card-sub">최근 측정 · ${formatDateKr(latest.date)} ${latest.time || ''}</div>
        <div class="bp-big">${latest.sys}<span>/</span>${latest.dia} <small>mmHg</small></div>
        ${latest.pulse ? `<div class="card-sub">맥박 ${latest.pulse} bpm</div>` : ''}
      </div>
      <div class="badge ${latestCls.cls}">${latestCls.label}</div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><div class="card-title">혈압 트렌드</div></div>
      ${rangePickerHtml(range)}
      <div id="bp-chart">${chartHtml(list)}</div>
    </div>

    <div class="section-title">전체 기록 <span class="count">${list.length}건</span></div>
    ${list.length ? `<div class="card list-card">${list.slice(0, shown).map(rowHtml).join('')}</div>${showMoreHtml(list.length, shown)}` : emptyStateHtml('🩺', '혈압을 정기적으로 입력하면<br>트렌드와 평균을 확인할 수 있어요.<br><small>아침(기상 후 1시간 이내)·저녁(취침 전) 측정을 권장해요.</small>')}
  `;

  container.querySelector('#add-bp-btn').addEventListener('click', () => openBpForm());
  bindSegmented(container, (name, value) => {
    if (name !== 'range') return;
    range = value;
    container.querySelector('#bp-chart').innerHTML = chartHtml(list);
  });
  container.querySelector('[data-show-more]')?.addEventListener('click', () => {
    shown += PAGE_SIZE * 2;
    renderBp(container);
  });
  container.querySelectorAll('[data-bp-id]').forEach((row) => {
    row.addEventListener('click', () => openBpForm(list.find((b) => b.id === row.dataset.bpId)));
  });
}

function chartHtml(list) {
  const inRange = filterByRange(list, range);
  if (!inRange.length) return emptyStateHtml('📈', '이 기간에 기록이 없어요.');
  // Average multiple readings in the same day into one point.
  const byDay = new Map();
  for (const b of inRange) {
    const arr = byDay.get(b.date) || [];
    arr.push(b);
    byDay.set(b.date, arr);
  }
  const days = [...byDay].map(([date, arr]) => ({ date, ...averageOf(arr) }));
  const series = [
    { name: '수축기', color: 'var(--danger)', points: days.map((d) => ({ date: d.date, y: d.sys })) },
    { name: '이완기', color: 'var(--accent)', points: days.map((d) => ({ date: d.date, y: d.dia })) },
  ];
  const pulseDays = days.filter((d) => d.pulse);
  if (pulseDays.length) series.push({ name: '맥박', color: 'var(--text-tertiary)', points: pulseDays.map((d) => ({ date: d.date, y: d.pulse })), dashed: true, dots: false, width: 1.5 });

  const refLines = [
    { y: 130, color: 'var(--warn)', label: '130' },
    { y: 80, color: 'var(--warn)', label: '80' },
  ];

  const all = averageOf(inRange);
  const morning = averageOf(inRange.filter((b) => isMorningTime(b.time)));
  const evening = averageOf(inRange.filter((b) => b.time && !isMorningTime(b.time)));
  const avgCell = (title, a) => {
    if (!a) return `<div class="avg-cell"><div class="t">${title}</div><div class="v">-</div></div>`;
    const c = classifyBp(a.sys, a.dia);
    return `<div class="avg-cell"><div class="t">${title} <small>(${a.count}회)</small></div><div class="v ${c.cls}">${a.sys}/${a.dia}</div></div>`;
  };

  return `${lineChart({ series, refLines, yPad: 5, unit: '' })}
    <div class="avg-grid">${avgCell('기간 평균', all)}${avgCell('아침 평균', morning)}${avgCell('저녁 평균', evening)}</div>
    <div class="desc" style="margin-top:8px;">가정혈압 기준 135/85 mmHg 이상이면 고혈압으로 봅니다. 진단·치료는 의사와 상담하세요.</div>`;
}

function rowHtml(b) {
  const c = classifyBp(Number(b.sys), Number(b.dia));
  const sub = [b.time, b.arm ? `${b.arm === 'L' ? '왼팔' : '오른팔'}` : '', b.memo].filter(Boolean).join(' · ');
  return `
    <div class="list-row" data-bp-id="${b.id}">
      <div class="info">
        <div class="main">${formatDateKr(b.date)} <span class="badge sm ${c.cls}">${c.label}</span></div>
        ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <div class="row-value">
        <b>${b.sys}/${b.dia}</b>
        ${b.pulse ? `<span>♥ ${b.pulse}</span>` : '<span>mmHg</span>'}
      </div>
    </div>`;
}

export function openBpForm(entry = null) {
  const isEdit = !!entry;
  const e = entry || { date: todayStr(), time: nowTimeStr() };

  openEntrySheet(isEdit ? '혈압 수정' : '혈압 입력', (body, close) => {
    body.innerHTML = `
      <div class="field-row">
        <div class="field"><label>날짜</label><input type="date" id="bp-date" value="${e.date}"></div>
        <div class="field"><label>시간</label><input type="time" id="bp-time" value="${e.time || ''}"></div>
      </div>
      <div class="field-row three">
        <div class="field"><label>수축기 (최고)</label><input type="number" id="bp-sys" inputmode="numeric" min="50" max="260" placeholder="120" value="${e.sys ?? ''}"></div>
        <div class="field"><label>이완기 (최저)</label><input type="number" id="bp-dia" inputmode="numeric" min="30" max="160" placeholder="80" value="${e.dia ?? ''}"></div>
        <div class="field"><label>맥박</label><input type="number" id="bp-pulse" inputmode="numeric" min="30" max="220" placeholder="70" value="${e.pulse ?? ''}"></div>
      </div>
      <div id="bp-preview" class="bp-preview"></div>
      <div class="field">
        <label>측정 팔</label>
        <div class="segmented" data-name="arm">
          <button type="button" class="seg-btn${e.arm === 'L' ? ' active' : ''}" data-value="L">왼팔</button>
          <button type="button" class="seg-btn${e.arm === 'R' ? ' active' : ''}" data-value="R">오른팔</button>
        </div>
      </div>
      <div class="field"><label>메모</label><input type="text" id="bp-memo" placeholder="복약 여부, 컨디션 등" value="${escapeHtml(e.memo || '')}"></div>
      <div class="btn-row">
        ${isEdit ? '<button class="btn btn-danger" id="bp-delete">삭제</button>' : ''}
        <button class="btn btn-primary" id="bp-save">저장</button>
      </div>
    `;
    const $ = (id) => body.querySelector(id);
    let arm = e.arm || null;
    bindSegmented(body, (name, value) => { if (name === 'arm') arm = value; });

    const preview = () => {
      const sys = Number($('#bp-sys').value);
      const dia = Number($('#bp-dia').value);
      const el = $('#bp-preview');
      if (!sys || !dia) { el.innerHTML = ''; return; }
      const c = classifyBp(sys, dia);
      el.innerHTML = `<span class="badge ${c.cls}">${c.label}</span>`;
    };
    $('#bp-sys').addEventListener('input', preview);
    $('#bp-dia').addEventListener('input', preview);
    preview();
    if (!isEdit) setTimeout(() => $('#bp-sys').focus(), 250);

    $('#bp-save').addEventListener('click', () => {
      const sys = Number($('#bp-sys').value);
      const dia = Number($('#bp-dia').value);
      if (!$('#bp-date').value) return toast('날짜를 입력해주세요.');
      if (!sys || !dia || sys < 50 || sys > 260 || dia < 30 || dia > 160) return toast('혈압 값을 올바르게 입력해주세요.');
      if (dia >= sys) return toast('이완기 혈압은 수축기보다 낮아야 해요.');
      try {
        upsertEntry('bps', {
          ...(isEdit ? { id: e.id } : {}),
          date: $('#bp-date').value,
          time: $('#bp-time').value,
          sys,
          dia,
          pulse: Number($('#bp-pulse').value) || null,
          arm,
          memo: $('#bp-memo').value.trim(),
        });
        toast(isEdit ? '수정되었습니다.' : '혈압이 기록되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });

    $('#bp-delete')?.addEventListener('click', () => {
      if (!confirmAction('이 혈압 기록을 삭제할까요?')) return;
      try {
        deleteEntry('bps', e.id);
        toast('삭제되었습니다.');
        close();
      } catch (err) {
        toast(err.message, 4000);
      }
    });
  });
}
