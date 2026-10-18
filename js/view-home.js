import { getState, getList, getBackupStatus, latestWeight, exerciseKcal } from './state.js';
import { morningStreak, weekSummary, dailyTotals, exerciseRowHtml, openExerciseForm } from './view-exercise.js';
import { openWeightForm, weightChange } from './view-weight.js';
import { openBpForm, classifyBp } from './view-bp.js';
import { todayStr, formatDateKr, addDays, diffDays, dateToStr, formatMinutes, strToDate } from './utils.js';

export function renderHome(container, { goToTab, openSettings }) {
  const today = todayStr();
  const { profile } = getState().settings;
  const todayList = getList('exercises').filter((e) => e.date === today);
  const todayKcal = todayList.reduce((s, e) => s + exerciseKcal(e), 0);
  const todayMin = todayList.reduce((s, e) => s + (Number(e.durationMin) || 0), 0);
  const goal = Number(profile.dailyKcalGoal) || 0;
  const pct = goal ? Math.min(100, Math.round((todayKcal / goal) * 100)) : 0;
  const streak = morningStreak();
  const week = weekSummary();
  const lw = latestWeight();
  const wChange = weightChange(7);
  const lastBp = getList('bps')[0];
  const bpCls = lastBp ? classifyBp(Number(lastBp.sys), Number(lastBp.dia)) : null;

  container.innerHTML = `
    ${backupBannerHtml()}

    <div class="hero-card">
      <div class="hero-top">
        <div>
          <div class="hero-date">${formatDateKr(today)}</div>
          <div class="hero-title">${todayList.length ? '오늘도 운동 완료! 💪' : greeting()}</div>
        </div>
        <div class="streak ${streak ? 'on' : ''}">
          <div class="n">🔥 ${streak}</div>
          <div class="l">아침 연속</div>
        </div>
      </div>
      <div class="ring-row">
        ${ringSvg(pct)}
        <div class="ring-info">
          <div class="big">${todayKcal.toLocaleString()}<small> kcal</small></div>
          <div class="sub">${goal ? `목표 ${goal.toLocaleString()} kcal · ${pct}%` : '오늘 소모 칼로리'}</div>
          <div class="sub">${todayMin ? `${formatMinutes(todayMin)} 운동` : '아직 운동 기록이 없어요'}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="quick-exercise">+ 오늘 운동 기록하기</button>
    </div>

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

    <div class="section-title">이번 주 아침 운동</div>
    <div class="card">
      ${weekDotsHtml()}
      <div class="week-sum">
        <span><b>${week.days}</b>일 운동</span>
        <span><b>${week.kcal.toLocaleString()}</b> kcal</span>
        <span><b>${formatMinutes(week.minutes)}</b></span>
      </div>
    </div>

    ${todayList.length ? `
      <div class="section-title">오늘 운동 <a class="action-link" id="go-exercise">전체 보기 ›</a></div>
      <div class="card list-card">${todayList.map(exerciseRowHtml).join('')}</div>` : ''}
  `;

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
  const r = 34;
  const c = 2 * Math.PI * r;
  return `
    <svg class="ring" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="${r}" class="ring-bg"/>
      <circle cx="42" cy="42" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 42 42)"/>
      <text x="42" y="47" text-anchor="middle" class="ring-text">${pct}%</text>
    </svg>`;
}

function weekDotsHtml() {
  const totals = dailyTotals();
  const today = todayStr();
  const start = addDays(today, -((strToDate(today).getDay() + 6) % 7));
  const names = ['월', '화', '수', '목', '금', '토', '일'];
  return `<div class="week-dots">${names.map((n, i) => {
    const d = addDays(start, i);
    const t = totals[d];
    const state = t?.morning ? 'morning' : t ? 'done' : d > today ? 'future' : '';
    return `<div class="wd ${state}${d === today ? ' today' : ''}"><div class="dot">${t?.morning ? '☀️' : t ? '✓' : ''}</div><div class="n">${n}</div></div>`;
  }).join('')}</div>
  <div class="desc" style="text-align:center;margin-top:6px;">☀️ 운동한 날</div>`;
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
