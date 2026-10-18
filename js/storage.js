const EXERCISES_KEY = 'health_exercises_v1';
const WEIGHTS_KEY = 'health_weights_v1';
const BPS_KEY = 'health_bps_v1';
const SETTINGS_KEY = 'health_settings_v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('storage read failed', key, e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage write failed', key, e);
    return false;
  }
}

export function getExercises() {
  return readJson(EXERCISES_KEY, []);
}

export function saveExercises(list) {
  return writeJson(EXERCISES_KEY, list);
}

export function getWeights() {
  return readJson(WEIGHTS_KEY, []);
}

export function saveWeights(list) {
  return writeJson(WEIGHTS_KEY, list);
}

export function getBps() {
  return readJson(BPS_KEY, []);
}

export function saveBps(list) {
  return writeJson(BPS_KEY, list);
}

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  profile: {
    heightCm: null,
    defaultWeightKg: 70,
    goalWeightKg: null,
    dailyKcalGoal: 300,
  },
  backupIntervalDays: 7,
  lastDataChangeAt: null,
  lastExportAt: null,
};

export function getSettings() {
  const saved = readJson(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    profile: { ...DEFAULT_SETTINGS.profile, ...(saved.profile || {}) },
  };
}

export function saveSettings(settings) {
  return writeJson(SETTINGS_KEY, settings);
}
