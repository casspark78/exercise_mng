/**
 * Exercise catalogue with MET values (Compendium of Physical Activities, 2011/2024).
 * Calories are estimated as: kcal = MET × 체중(kg) × 시간(h).
 * Intensity scales the base MET so one entry covers easy/normal/hard sessions.
 */
export const EXERCISE_TYPES = [
  { id: 'walk', name: '걷기', icon: '🚶', met: 3.5, distance: true },
  { id: 'brisk_walk', name: '빠르게 걷기', icon: '🚶‍♂️', met: 4.8, distance: true },
  { id: 'jog', name: '조깅', icon: '🏃', met: 7.0, distance: true },
  { id: 'run', name: '달리기', icon: '🏃‍♂️', met: 9.8, distance: true },
  { id: 'treadmill', name: '러닝머신', icon: '🏃‍♀️', met: 6.0, distance: true },
  { id: 'cycle_out', name: '자전거 (야외)', icon: '🚴', met: 7.5, distance: true },
  { id: 'cycle_in', name: '실내 자전거', icon: '🚲', met: 6.8, distance: true },
  { id: 'swim', name: '수영', icon: '🏊', met: 6.0, distance: true },
  { id: 'hike', name: '등산', icon: '⛰️', met: 6.5, distance: true },
  { id: 'stairs', name: '계단 오르기', icon: '🪜', met: 8.8, distance: false },
  { id: 'rope', name: '줄넘기', icon: '🪢', met: 11.0, distance: false },
  { id: 'weights', name: '근력 운동', icon: '🏋️', met: 5.0, distance: false },
  { id: 'bodyweight', name: '맨몸 운동 (홈트)', icon: '💪', met: 3.8, distance: false },
  { id: 'elliptical', name: '일립티컬', icon: '⚙️', met: 5.0, distance: false },
  { id: 'rowing', name: '로잉머신', icon: '🚣', met: 7.0, distance: false },
  { id: 'yoga', name: '요가', icon: '🧘', met: 2.5, distance: false },
  { id: 'pilates', name: '필라테스', icon: '🤸', met: 3.0, distance: false },
  { id: 'stretch', name: '스트레칭', icon: '🙆', met: 2.3, distance: false },
  { id: 'golf_practice', name: '골프 연습', icon: '⛳', met: 3.0, distance: false },
  { id: 'badminton', name: '배드민턴', icon: '🏸', met: 5.5, distance: false },
  { id: 'tennis', name: '테니스', icon: '🎾', met: 7.3, distance: false },
  { id: 'custom', name: '기타 (MET 직접 입력)', icon: '✨', met: 4.0, distance: false },
];

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

export function effectiveMet({ typeId, intensity, customMet }) {
  const base = typeId === 'custom' && customMet ? Number(customMet) : findType(typeId).met;
  return base * intensityFactor(intensity);
}

export function calcKcal({ typeId, intensity, customMet, durationMin, weightKg }) {
  if (!durationMin || !weightKg) return 0;
  const met = effectiveMet({ typeId, intensity, customMet });
  return Math.round(met * weightKg * (durationMin / 60));
}

export function exerciseLabel(entry) {
  if (entry.typeId === 'custom' && entry.customName) return entry.customName;
  return findType(entry.typeId).name;
}
