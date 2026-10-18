import {
  subscribe, getState, updateSettings, updateProfile, markExported, buildBackup, importBackup,
  getBackupStatus, getList, exerciseKcal,
} from './state.js';
import { renderHome } from './view-home.js';
import { renderExercise } from './view-exercise.js';
import { renderWeight } from './view-weight.js';
import { renderBp } from './view-bp.js';
import { openModal, closeModal, toast, confirmAction, bindEntrySheetChrome } from './components.js';
import { exerciseLabel } from './met.js';
import { getLocalStorageUsageBytes, todayStr, formatDateKr, dateToStr, diffDays } from './utils.js';

const SUN_PATH = `<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`;
const MOON_PATH = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

let currentTab = 'home';

const views = {
  home: document.getElementById('view-home'),
  exercise: document.getElementById('view-exercise'),
  weight: document.getElementById('view-weight'),
  bp: document.getElementById('view-bp'),
};

function goToTab(tab) {
  currentTab = tab;
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle('active', name === tab);
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderCurrentView();
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  if (currentTab === 'home') renderHome(views.home, { goToTab, openSettings });
  else if (currentTab === 'exercise') renderExercise(views.exercise);
  else if (currentTab === 'weight') renderWeight(views.weight);
  else if (currentTab === 'bp') renderBp(views.bp);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-icon').innerHTML = theme === 'dark' ? SUN_PATH : MOON_PATH;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#141A24' : '#F0F5F8');
}

function setupTabBar() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => goToTab(btn.dataset.tab));
  });
}

function setupThemeToggle() {
  applyTheme(getState().settings.theme);
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const next = getState().settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next });
    applyTheme(next);
  });
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/* ---------- Backup files ---------- */

function backupFileName(ext = 'json') {
  return `health-log-backup-${todayStr()}.${ext}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupBlob() {
  return new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
}

function canShareFiles() {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function exportBackup(viaShare) {
  const blob = backupBlob();
  const filename = backupFileName();
  if (viaShare) {
    const file = new File([blob], filename, { type: 'application/json' });
    try {
      await navigator.share({ files: [file], title: '건강 기록 백업' });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    downloadBlob(blob, filename);
  }
  markExported();
  return true;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const rows = [['구분', '날짜', '시간', '항목', '값1', '값2', '값3', '메모']];
  getList('exercises').forEach((e) => rows.push(['운동', e.date, e.time, exerciseLabel(e), `${e.durationMin}분`, `${exerciseKcal(e)}kcal`, e.distanceKm ? `${e.distanceKm}km` : '', e.memo]));
  getList('weights').forEach((w) => rows.push(['체중', w.date, w.time, '체중(kg)', w.kg, w.bodyFat ? `체지방 ${w.bodyFat}%` : '', '', w.memo]));
  getList('bps').forEach((b) => rows.push(['혈압', b.date, b.time, '수축기/이완기/맥박', b.sys, b.dia, b.pulse || '', b.memo]));
  const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), backupFileName('csv'));
}

/* ---------- Settings ---------- */

const settingsOverlay = document.getElementById('settings-modal-overlay');

function openSettings() {
  renderSettings();
  openModal(settingsOverlay);
}

function backupStatusHtml() {
  const s = getBackupStatus();
  let last = '없음';
  if (s.lastExportAt) {
    const d = dateToStr(new Date(s.lastExportAt));
    const ago = diffDays(d, todayStr());
    last = `${formatDateKr(d)} (${ago ? `${ago}일 전` : '오늘'})`;
  }
  const state = s.needsExport
    ? `<span class="warn">백업 이후 변경된 기록이 있어요</span>`
    : `<span class="good">최신 상태로 백업되어 있어요</span>`;
  return `<div class="backup-status"><div>마지막 백업: <b>${last}</b></div><div>${state}</div></div>`;
}

function renderSettings() {
  const body = document.getElementById('settings-modal-body');
  const { profile, backupIntervalDays } = getState().settings;
  const counts = {
    ex: getState().exercises.length,
    w: getState().weights.length,
    bp: getState().bps.length,
  };
  const shareable = canShareFiles();

  body.innerHTML = `
    <div class="settings-group-title">내 정보</div>
    <div class="field-row">
      <div class="field"><label>키 (cm)</label><input type="number" id="set-height" inputmode="decimal" step="0.1" value="${profile.heightCm ?? ''}" placeholder="170"></div>
      <div class="field"><label>목표 체중 (kg)</label><input type="number" id="set-goal-weight" inputmode="decimal" step="0.1" value="${profile.goalWeightKg ?? ''}" placeholder="선택"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>기본 체중 (kg)</label><input type="number" id="set-default-weight" inputmode="decimal" step="0.1" value="${profile.defaultWeightKg ?? ''}"></div>
      <div class="field"><label>하루 칼로리 목표</label><input type="number" id="set-kcal-goal" inputmode="numeric" value="${profile.dailyKcalGoal ?? ''}"></div>
    </div>
    <div class="desc">칼로리는 <b>MET × 체중(kg) × 운동시간(h)</b>으로 계산해요. 운동한 날짜의 가장 최근 체중 기록을 쓰고, 체중 기록이 없으면 기본 체중을 사용합니다.</div>
    <button class="btn btn-secondary btn-block" id="save-profile-btn" style="margin-top:12px;">내 정보 저장</button>

    <div class="settings-group-title">백업</div>
    ${backupStatusHtml()}
    <div class="field">
      <label>백업 알림 주기</label>
      <select id="set-backup-interval">
        ${[[0, '기록이 바뀔 때마다'], [1, '매일'], [3, '3일마다'], [7, '매주 (권장)'], [14, '2주마다'], [30, '매월']].map(([v, l]) => `<option value="${v}"${Number(backupIntervalDays) === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="desc">주기가 지나면 홈 화면에 "백업이 필요해요" 알림이 표시됩니다. 모든 기록은 이 기기 브라우저에만 저장되니, 백업 파일을 iCloud·Google 드라이브 등에 보관하세요.</div>
    <div class="btn-row" style="margin-top:12px;">
      <button class="btn btn-primary" id="export-data-btn">백업 파일 저장</button>
      ${shareable ? '<button class="btn btn-secondary" id="share-data-btn">공유로 보내기</button>' : ''}
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn btn-secondary" id="import-data-btn">백업 불러오기</button>
      <button class="btn btn-secondary" id="export-csv-btn">CSV 내보내기</button>
    </div>
    <input type="file" accept="application/json,.json" id="import-file-input" class="hidden">

    <div class="settings-group-title">데이터</div>
    <div class="desc">운동 ${counts.ex}건 · 체중 ${counts.w}건 · 혈압 ${counts.bp}건 · 사용량 ${formatBytes(getLocalStorageUsageBytes())} / 5MB</div>
    <button class="btn btn-danger btn-block" id="reset-data-btn" style="margin-top:12px;">모든 데이터 삭제</button>
  `;

  const $ = (id) => body.querySelector(id);
  const num = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };

  $('#save-profile-btn').addEventListener('click', () => {
    updateProfile({
      heightCm: num('#set-height'),
      goalWeightKg: num('#set-goal-weight'),
      defaultWeightKg: num('#set-default-weight') || 70,
      dailyKcalGoal: num('#set-kcal-goal') || 0,
    });
    toast('저장되었습니다.');
  });

  $('#set-backup-interval').addEventListener('change', (e) => {
    updateSettings({ backupIntervalDays: Number(e.target.value) });
    toast('백업 알림 주기가 변경되었습니다.');
  });

  const runExport = async (btn, viaShare) => {
    btn.disabled = true;
    try {
      if (await exportBackup(viaShare)) {
        toast('백업 파일을 저장했습니다.');
        renderSettings();
      }
    } catch (e) {
      console.error(e);
      toast('백업에 실패했습니다.', 3200);
    } finally {
      btn.disabled = false;
    }
  };
  $('#export-data-btn').addEventListener('click', (e) => runExport(e.currentTarget, false));
  $('#share-data-btn')?.addEventListener('click', (e) => runExport(e.currentTarget, true));
  $('#export-csv-btn').addEventListener('click', () => {
    exportCsv();
    toast('CSV 파일을 내보냈습니다.');
  });

  const importInput = $('#import-file-input');
  $('#import-data-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const hasCurrent = counts.ex + counts.w + counts.bp > 0;
      let mode = 'merge';
      if (hasCurrent) {
        if (confirmAction('현재 기록에 백업 파일의 기록을 합칠까요?\n(이미 있는 기록은 건너뜁니다)\n\n[취소]를 누르면 덮어쓰기를 선택할 수 있어요.')) {
          mode = 'merge';
        } else if (confirmAction('현재 기록을 모두 지우고 백업 파일로 덮어쓸까요?\n이 작업은 되돌릴 수 없습니다.')) {
          mode = 'replace';
        } else {
          return;
        }
      }
      const { added, skipped } = importBackup(data, mode);
      toast(`${added}건 불러옴${skipped ? `, ${skipped}건 중복으로 건너뜀` : ''}`, 3200);
      renderSettings();
    } catch (e) {
      console.error(e);
      toast(e instanceof SyntaxError ? '파일 형식이 올바르지 않습니다.' : (e.message || '불러오기에 실패했습니다.'), 4000);
    } finally {
      importInput.value = '';
    }
  });

  $('#reset-data-btn').addEventListener('click', () => {
    if (!confirmAction('운동·체중·혈압 기록을 모두 삭제할까요?\n먼저 백업 파일을 저장해두는 것을 권장합니다.')) return;
    if (!confirmAction('정말 삭제할까요? 되돌릴 수 없습니다.')) return;
    try {
      importBackup({ app: 'health-log', exercises: [], weights: [], bps: [] }, 'replace');
      toast('모든 데이터를 삭제했습니다.');
      renderSettings();
    } catch (e) {
      toast(e.message, 4000);
    }
  });
}

function setupSettingsModal() {
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-modal-close').addEventListener('click', () => closeModal(settingsOverlay));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeModal(settingsOverlay);
  });
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => {
        console.error('Service worker registration failed', err);
      });
    });
  }
}

function requestPersistentStorage() {
  // Asks the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
}

function init() {
  setupTabBar();
  setupThemeToggle();
  bindEntrySheetChrome();
  setupSettingsModal();
  setupServiceWorker();
  requestPersistentStorage();
  subscribe(() => renderCurrentView());
  // Re-render when the app comes back to the foreground on a new day.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderCurrentView();
  });
  goToTab('home');
}

init();
