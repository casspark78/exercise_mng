/**
 * Exercise catalogue with MET values (Compendium of Physical Activities, 2011/2024).
 * Calories are estimated as: kcal = MET × 체중(kg) × 시간(h).
 * Intensity scales the base MET so one entry covers easy/normal/hard sessions.
 */
export const EXERCISE_TYPES = [
  // 자주 하는 운동 (전용 입력 화면)
  { id: 'treadmill', name: '런닝머신', icon: '🏃', met: 6.0, kind: 'treadmill', category: '유산소', routine: true },
  { id: 'situp', name: '윗몸 일으키기', icon: '🧘', met: 3.8, kind: 'reps', category: '근력 · 복부', routine: true },
  { id: 'bench', name: '벤치프레스', icon: '🏋️', met: 5.0, kind: 'weighted', category: '근력 · 가슴', routine: true },
  { id: 'dumbbell', name: '덤벨', icon: '💪', met: 3.5, kind: 'weighted', category: '근력 · 팔', routine: true },
  // 기타 운동 (시간 기반)
  { id: 'walk', name: '걷기', icon: '🚶', met: 3.5, distance: true },
  { id: 'brisk_walk', name: '빠르게 걷기', icon: '🚶‍♂️', met: 4.8, distance: true },
  { id: 'jog', name: '조깅', icon: '🏃‍♂️', met: 7.0, distance: true },
  { id: 'run', name: '달리기', icon: '🏃‍♀️', met: 9.8, distance: true },
  { id: 'cycle_out', name: '자전거 (야외)', icon: '🚴', met: 7.5, distance: true },
  { id: 'cycle_in', name: '실내 자전거', icon: '🚲', met: 6.8, distance: true },
  { id: 'swim', name: '수영', icon: '🏊', met: 6.0, distance: true },
  { id: 'hike', name: '등산', icon: '⛰️', met: 6.5, distance: true },
  { id: 'stairs', name: '계단 오르기', icon: '🪜', met: 8.8, distance: false },
  { id: 'rope', name: '줄넘기', icon: '🪢', met: 11.0, distance: false },
  { id: 'weights', name: '근력 운동 (기타)', icon: '🏋️‍♂️', met: 5.0, distance: false },
  { id: 'bodyweight', name: '맨몸 운동 (홈트)', icon: '🤾', met: 3.8, distance: false },
  { id: 'elliptical', name: '일립티컬', icon: '⚙️', met: 5.0, distance: false },
  { id: 'rowing', name: '로잉머신', icon: '🚣', met: 7.0, distance: false },
  { id: 'yoga', name: '요가', icon: '🧘‍♀️', met: 2.5, distance: false },
  { id: 'pilates', name: '필라테스', icon: '🤸', met: 3.0, distance: false },
  { id: 'stretch', name: '스트레칭', icon: '🙆', met: 2.3, distance: false },
  { id: 'golf_practice', name: '골프 연습', icon: '⛳', met: 3.0, distance: false },
  { id: 'badminton', name: '배드민턴', icon: '🏸', met: 5.5, distance: false },
  { id: 'tennis', name: '테니스', icon: '🎾', met: 7.3, distance: false },
  { id: 'custom', name: '기타 (MET 직접 입력)', icon: '✨', met: 4.0, distance: false },
];

export const ROUTINE_TYPES = EXERCISE_TYPES.filter((t) => t.routine);
export const OTHER_TYPES = EXERCISE_TYPES.filter((t) => !t.routine);

/**
 * Treadmill MET by speed (km/h), interpolated from the Compendium's
 * walking/running entries. Below ~7km/h is walking, above is running.
 */
const SPEED_MET = [
  [3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 6.0],
  [8.0, 8.3], [8.4, 9.0], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.1, 11.5],
  [12.9, 11.8], [13.8, 12.3], [14.5, 12.8], [16.1, 14.5], [17.7, 16.0], [19.3, 19.0],
];

export function metFromSpeed(kmh) {
  if (!kmh || kmh <= 0) return 0;
  if (kmh <= SPEED_MET[0][0]) return SPEED_MET[0][1];
  for (let i = 1; i < SPEED_MET.length; i++) {
    const [s1, m1] = SPEED_MET[i];
    if (kmh <= s1) {
      const [s0, m0] = SPEED_MET[i - 1];
      return m0 + ((kmh - s0) / (s1 - s0)) * (m1 - m0);
    }
  }
  return SPEED_MET[SPEED_MET.length - 1][1];
}

/**
 * Strength entries store a single total rep count (and weight). Records made
 * while the form still had per-set rows carry `sets` instead, so read
 * through these helpers to get one number either way.
 */
export function entryReps(e) {
  if (e.reps != null) return Number(e.reps) || 0;
  return (e.sets || []).reduce((s, x) => s + (Number(x.reps) || 0), 0);
}

export function entryKg(e) {
  if (e.kg != null) return Number(e.kg) || 0;
  return Math.max(0, ...(e.sets || []).map((x) => Number(x.kg) || 0));
}

export const INTENSITIES = [
  { id: 'easy', name: '가볍게', factor: 0.8 },
  { id: 'normal', name: '보통', factor: 1.0 },
  { id: 'hard', name: '힘들게', factor: 1.25 },
];

export function findType(id) {
  return EXERCISE_TYPES.find((t) => t.id === id) || EXERCISE_TYPES[EXERCISE_TYPES.length - 1];
}

export function intensityFactor(id) {
  return (INTENSITIES.find((i) => i.id === id) || INTENSITIES[1]).factor;
}

export function effectiveMet({ typeId, intensity, customMet, speedKmh }) {
  // Treadmill effort is fully described by speed, so intensity doesn't apply.
  if (typeId === 'treadmill' && speedKmh) return metFromSpeed(Number(speedKmh));
  const base = typeId === 'custom' && customMet ? Number(customMet) : findType(typeId).met;
  return base * intensityFactor(intensity);
}

export function calcKcal(entry) {
  const { durationMin, weightKg } = entry;
  if (!durationMin || !weightKg) return 0;
  const met = effectiveMet(entry);
  return Math.round(met * weightKg * (durationMin / 60));
}

export function exerciseLabel(entry) {
  if (entry.typeId === 'custom' && entry.customName) return entry.customName;
  return findType(entry.typeId).name;
}
