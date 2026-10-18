import { getState, getList, getBackupStatus, latestWeight, exerciseKcal } from './state.js';
import { morningStreak, dailyTotals, exerciseRowHtml, openExerciseForm } from './view-exercise.js';
import { openWeightForm, weightChange } from './view-weight.js';
import { openBpForm, classifyBp } from './view-bp.js';
import { exerciseLabel as findTypeLabel } from './met.js';
import { todayStr, formatDateKr, diffDays, dateToStr, formatMinutes, strToDate } from './utils.js';

export function renderHome(container, { goToTab, openSettings }) {
  const today = todayStr();
  const { profile } = getState().settings;
  const todayList = getList('exercises').filter((e) => e.date === today);
  const todayKcal = todayList.reduce((s, e) => s + exerciseKcal(e), 0);
  const todayMin = todayList.reduce((s, e) => s + (Number(e.durationMin) || 0), 0);
  const goal = Number(profile.dailyKcalGoal) || 0;
  const pct = goal ? Math.min(100, Math.round((todayKcal / goal) * 100)) : 0;
  const streak = morningStreak();
  const lw = latestWeight();
  const wChange = weightChange(7);
  const lastBp = getList('bps')[0];
  const bpCls = lastBp ? classifyBp(Number(lastBp.sys), Number(lastBp.dia)) : null;

  container.innerHTML = `
    ${backupBannerHtml()}

    <div class="hero-card">
      <div class="hero-row">
        ${ringSvg(pct)}
        <div class="ring-info">
          <div class="hero-date">${formatDateKr(today)} · ${todayList.length ? '운동 완료 💪' : greeting()}</div>
          <div class="big">${todayKcal.toLocaleString()}<small> kcal</small></div>
          <div class="sub">${goal ? `목표 ${goal.toLocaleString()} · ` : ''}${todayMin ? `${formatMinutes(todayMin)} 운동` : '아직 기록 없음'}</div>
        </div>
        <div class="streak ${streak ? 'on' : ''}">
          <div class="n">🔥 ${streak}</div>
          <div class="l">연속</div>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="quick-exercise">+ 오늘 운동 기록하기</button>
    </div>

    <div class="card heatmap-card" id="heatmap-card">${heatmapHtml(goal)}</div>

    <div class="quick-grid">
      <button class="quick-tile" id="quick-weight">
        <div class="q-label">⚖️ 체중</div>
        <div class="q-value">${lw ? `${lw.kg}<small>kg</small>` : '-'}</div>
        <div class="q-sub">${lw ? `${relDay(lw.date)}${wChange != null ? ` · 7일 ${wChange > 0 ? '+' : ''}${wChange}kg` : ''}` : '탭해서 입력'}</div>
      </button>
      <button class="quick-tile" id="quick-bp">
        <div class="q-label">🩺 혈압</div>
        <div class="q-value">${lastBp ? `${lastBp.sys}/${lastBp.dia}` : '-'}</div>
        <div class="q-sub">${lastBp ? `${relDay(lastBp.date)} · <span class="${bpCls.cls}">${bpCls.label}</span>` : '탭해서 입력'}</div>
      </button>
    </div>
    ${reminderHtml(lw, lastBp)}

    ${todayList.length ? `
      <div class="section-title">오늘 운동 <a class="action-link" id="go-exercise">전체 보기 ›</a></div>
      <div class="card list-card">${todayList.map(exerciseRowHtml).join('')}</div>` : ''}
  `;

  bindHeatmap(container.querySelector('#heatmap-card'), goal);
  container.querySelector('#backup-banner')?.addEventListener('click', openSettings);
  container.querySelector('#quick-exercise').addEventListener('click', () => openExerciseForm());
  container.querySelector('#quick-weight').addEventListener('click', () => openWeightForm());
  container.querySelector('#quick-bp').addEventListener('click', () => openBpForm());
  container.querySelector('#go-exercise')?.addEventListener('click', () => goToTab('exercise'));
  container.querySelectorAll('[data-exercise-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const entry = todayList.find((e) => e.id === row.dataset.exerciseId);
      if (entry) openExerciseForm(entry);
    });
  });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return '좋은 아침이에요! ☀️';
  if (h < 18) return '오늘 운동하셨나요?';
  return '오늘 하루 수고하셨어요';
}

function relDay(dateStr) {
  const d = diffDays(dateStr, todayStr());
  if (d === 0) return '오늘';
  if (d === 1) return '어제';
  return `${d}일 전`;
}

function ringSvg(pct) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return `
    <svg class="ring" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
      <circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 32 32)"/>
      <text x="32" y="36.5" text-anchor="middle" class="ring-text">${pct}%</text>
    </svg>`;
}

/* ---------- Monthly heatmap ---------- */

let monthOffset = 0;
let selectedDate = null;

/** 0 = no workout, 1..4 = share of the daily kcal goal (<50%, <100%, <150%, ≥150%). */
function heatLevel(kcal, goal) {
  if (!kcal) return 0;
  const g = goal || 300;
  if (kcal < g * 0.5) return 1;
  if (kcal < g) return 2;
  if (kcal < g * 1.5) return 3;
  return 4;
}

function heatmapHtml(goal) {
  const totals = dailyTotals();
  const today = todayStr();
  const now = strToDate(today);
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="hm-cell blank"></div>');
  const sum = { days: 0, kcal: 0, minutes: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateToStr(new Date(y, m, d));
    const t = totals[ds];
    if (t) { sum.days++; sum.kcal += t.kcal; sum.minutes += t.minutes; }
    const lv = heatLevel(t?.kcal, goal);
    const cls = ['hm-cell', `lv${lv}`, ds === today ? 'today' : '', ds > today ? 'future' : '', ds === selectedDate ? 'selected' : ''].filter(Boolean).join(' ');
    cells.push(`<button type="button" class="${cls}" data-date="${ds}" ${ds > today ? 'disabled' : ''}><span>${d}</span></button>`);
  }

  const elapsed = monthOffset === 0 ? now.getDate() : daysInMonth;
  const rate = elapsed ? Math.round((sum.days / elapsed) * 100) : 0;

  let detail = '날짜를 누르면 그날 운동을 볼 수 있어요';
  if (selectedDate) {
    const t = totals[selectedDate];
    const names = getList('exercises').filter((e) => e.date === selectedDate).map((e) => findTypeLabel(e));
    detail = t
      ? `<b>${formatDateKr(selectedDate)}</b> · ${t.kcal.toLocaleString()} kcal · ${names.join(', ')}`
      : `<b>${formatDateKr(selectedDate)}</b> · 운동 기록 없음`;
  }

  return `
    <div class="hm-head">
      <button type="button" class="hm-nav" data-nav="-1" aria-label="이전 달">‹</button>
      <div class="hm-title">${y}년 ${m + 1}월 운동</div>
      <button type="button" class="hm-nav" data-nav="1" aria-label="다음 달" ${monthOffset >= 0 ? 'disabled' : ''}>›</button>
    </div>
    <div class="hm-grid hm-weekdays">${['월', '화', '수', '목', '금', '토', '일'].map((n) => `<div>${n}</div>`).join('')}</div>
    <div class="hm-grid">${cells.join('')}</div>
    <div class="hm-legend">
      <span>적음</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hm-cell lv${l}"></i>`).join('')}<span>많음</span>
    </div>
    <div class="hm-detail">${detail}</div>
    <div class="week-sum">
      <span><b>${sum.days}</b>일 운동 <small>(${rate}%)</small></span>
      <span><b>${sum.kcal.toLocaleString()}</b> kcal</span>
      <span><b>${formatMinutes(sum.minutes)}</b></span>
    </div>`;
}

function bindHeatmap(card, goal) {
  card.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    const cell = ev.target.closest('.hm-cell[data-date]');
    if (nav && !nav.disabled) {
      monthOffset = Math.min(0, monthOffset + Number(nav.dataset.nav));
      selectedDate = null;
    } else if (cell && !cell.disabled) {
      selectedDate = selectedDate === cell.dataset.date ? null : cell.dataset.date;
    } else {
      return;
    }
    card.innerHTML = heatmapHtml(goal);
  });
}

function reminderHtml(lw, lastBp) {
  const tips = [];
  if (!lw) tips.push('체중을 입력하면 칼로리 계산이 더 정확해져요.');
  else if (diffDays(lw.date, todayStr()) >= 7) tips.push(`체중을 ${diffDays(lw.date, todayStr())}일째 입력하지 않았어요.`);
  if (lastBp && diffDays(lastBp.date, todayStr()) >= 7) tips.push(`혈압을 ${diffDays(lastBp.date, todayStr())}일째 측정하지 않았어요.`);
  if (!tips.length) return '';
  return `<div class="tip-line">💡 ${tips.join(' ')}</div>`;
}

function backupBannerHtml() {
  const status = getBackupStatus();
  if (!status.overdue) return '';
  const desc = status.lastExportAt
    ? `마지막 백업: ${formatDateKr(dateToStr(new Date(status.lastExportAt)))} · 이후 변경된 기록이 있어요`
    : '아직 한 번도 백업하지 않았어요. 기록은 이 기기에만 저장됩니다';
  return `
    <div class="backup-banner" id="backup-banner">
      <span class="icon">⚠️</span>
      <div class="text">
        <div class="title">백업이 필요해요</div>
        <div class="desc">${desc}</div>
      </div>
      <span class="chevron">›</span>
    </div>`;
}
