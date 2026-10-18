export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function todayStr() {
  return dateToStr(new Date());
}

export function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function strToDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = strToDate(dateStr);
  d.setDate(d.getDate() + days);
  return dateToStr(d);
}

export function diffDays(fromStr, toStr) {
  const a = strToDate(fromStr);
  const b = strToDate(toStr);
  return Math.round((b - a) / 86400000);
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr) {
  const d = strToDate(dateStr);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return dateToStr(d);
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateKr(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

export function formatMonthDay(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateYMDKr(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sort comparator: newest date/time first. */
export function byDateTimeDesc(a, b) {
  const ka = `${a.date} ${a.time || '00:00'}`;
  const kb = `${b.date} ${b.time || '00:00'}`;
  if (ka !== kb) return ka < kb ? 1 : -1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

export function formatMinutes(min) {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export function getLocalStorageUsageBytes() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      total += (key.length + (localStorage.getItem(key) || '').length) * 2;
    }
  } catch (e) {
    console.error(e);
  }
  return total;
}
