import {
  getExercises, saveExercises, getWeights, saveWeights, getBps, saveBps,
  getSettings, saveSettings, DEFAULT_SETTINGS,
} from './storage.js';
import { uid, byDateTimeDesc, todayStr } from './utils.js';
import { calcKcal } from './met.js';

const listeners = new Set();

const store = {
  exercises: getExercises(),
  weights: getWeights(),
  bps: getBps(),
  settings: getSettings(),
};

const SAVERS = {
  exercises: saveExercises,
  weights: saveWeights,
  bps: saveBps,
};

export const STORAGE_FULL_MESSAGE = '저장 공간이 부족해 변경사항이 저장되지 않았습니다. 설정에서 데이터를 내보낸 후 오래된 기록을 정리해주세요.';

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(store));
}

export function getState() {
  return store;
}

export function getList(kind) {
  return [...store[kind]].sort(byDateTimeDesc);
}

// Writes one collection to disk. On failure (localStorage quota) the
// in-memory change is rolled back so the UI never shows unsaved data.
function commit(kind, next) {
  const prev = store[kind];
  store[kind] = next;
  if (!SAVERS[kind](next)) {
    store[kind] = prev;
    throw new Error(STORAGE_FULL_MESSAGE);
  }
  store.settings.lastDataChangeAt = Date.now();
  saveSettings(store.settings);
  notify();
}

export function upsertEntry(kind, data) {
  const list = store[kind];
  if (data.id && list.some((e) => e.id === data.id)) {
    commit(kind, list.map((e) => (e.id === data.id ? { ...e, ...data, updatedAt: Date.now() } : e)));
    return data.id;
  }
  const entry = { ...data, id: uid(), createdAt: Date.now() };
  commit(kind, [...list, entry]);
  return entry.id;
}

export function deleteEntry(kind, id) {
  commit(kind, store[kind].filter((e) => e.id !== id));
}

export function updateSettings(patch) {
  store.settings = { ...store.settings, ...patch };
  saveSettings(store.settings);
  notify();
}

export function updateProfile(patch) {
  updateSettings({ profile: { ...store.settings.profile, ...patch } });
}

/**
 * Body weight used for calorie estimates on a given date: the most recent
 * weigh-in on or before that date, else the earliest one after it, else the
 * profile's default weight.
 */
export function weightForDate(dateStr = todayStr()) {
  const sorted = [...store.weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let found = null;
  for (const w of sorted) {
    if (w.date <= dateStr) found = w;
    else break;
  }
  if (!found && sorted.length) found = sorted[0];
  return found ? Number(found.kg) : Number(store.settings.profile.defaultWeightKg) || 70;
}

export function latestWeight() {
  const list = getList('weights');
  return list.length ? list[0] : null;
}

export function exerciseKcal(entry) {
  if (entry.kcalManual && entry.kcal != null) return Number(entry.kcal);
  return calcKcal({ ...entry, weightKg: entry.weightKg || weightForDate(entry.date) });
}

/* ---------- Backup ---------- */

export function markExported() {
  store.settings.lastExportAt = Date.now();
  saveSettings(store.settings);
  notify();
}

/**
 * needsExport: something changed since the last backup file was made.
 * overdue: the configured backup interval has passed since the last backup
 * (or no backup was ever made) while there is data to protect.
 */
export function getBackupStatus() {
  const { lastDataChangeAt, lastExportAt, backupIntervalDays } = store.settings;
  const hasData = store.exercises.length + store.weights.length + store.bps.length > 0;
  if (!hasData || !lastDataChangeAt) return { needsExport: false, overdue: false, lastExportAt };
  const needsExport = !lastExportAt || lastExportAt < lastDataChangeAt;
  // 0 means "remind after every change".
  const intervalMs = Number(backupIntervalDays ?? 7) * 86400000;
  const overdue = needsExport && (!lastExportAt || Date.now() - lastExportAt >= intervalMs);
  return { needsExport, overdue, sinceDate: lastExportAt || lastDataChangeAt, lastExportAt };
}

export function buildBackup() {
  const { theme, profile, backupIntervalDays } = store.settings;
  return {
    app: 'health-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: store.exercises,
    weights: store.weights,
    bps: store.bps,
    settings: { theme, profile, backupIntervalDays },
  };
}

/**
 * Merge a backup into the current data. Entries whose id already exists are
 * skipped, so importing the same file twice never duplicates records.
 * With mode 'replace' current records are discarded first.
 */
export function importBackup(data, mode = 'merge') {
  if (!data || typeof data !== 'object' || data.app !== 'health-log') {
    throw new Error('이 앱의 백업 파일이 아닙니다.');
  }
  const result = { added: 0, skipped: 0 };
  const next = {};
  for (const kind of ['exercises', 'weights', 'bps']) {
    const incoming = Array.isArray(data[kind]) ? data[kind] : [];
    const base = mode === 'replace' ? [] : store[kind];
    const ids = new Set(base.map((e) => e.id));
    const merged = [...base];
    for (const e of incoming) {
      if (!e || !e.date) continue;
      if (e.id && ids.has(e.id)) { result.skipped++; continue; }
      const entry = { ...e, id: e.id || uid() };
      ids.add(entry.id);
      merged.push(entry);
      result.added++;
    }
    next[kind] = merged;
  }

  const prev = { exercises: store.exercises, weights: store.weights, bps: store.bps };
  for (const kind of Object.keys(next)) {
    store[kind] = next[kind];
    if (!SAVERS[kind](next[kind])) {
      for (const k of Object.keys(prev)) {
        store[k] = prev[k];
        SAVERS[k](prev[k]);
      }
      throw new Error(STORAGE_FULL_MESSAGE);
    }
  }

  if (data.settings?.profile) {
    store.settings.profile = { ...DEFAULT_SETTINGS.profile, ...store.settings.profile, ...data.settings.profile };
  }
  if (data.settings?.backupIntervalDays != null) store.settings.backupIntervalDays = data.settings.backupIntervalDays;
  // Data that came from a backup file is already backed up.
  store.settings.lastDataChangeAt = Date.now();
  if (mode === 'replace') store.settings.lastExportAt = Date.now();
  saveSettings(store.settings);
  notify();
  return result;
}
