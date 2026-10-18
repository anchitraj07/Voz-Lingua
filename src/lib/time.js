export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first
export const LEVELS = [['A0', 'Complete beginner'], ['A1', 'A1 – Beginner'], ['A2', 'A2 – Elementary'], ['B1', 'B1 – Intermediate'], ['B2', 'B2 – Upper-intermediate'], ['C1', 'C1 – Advanced']];
export const ACADEMY_TZ = 'Asia/Kolkata';

export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || ACADEMY_TZ;
const dtf = (tz, o, loc = 'en-GB') => new Intl.DateTimeFormat(loc, { timeZone: tz, ...o });

export const fmtDay = (ms, tz) => dtf(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
export const fmtDayLong = (ms, tz) => dtf(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
export const fmtTime = (ms, tz) => dtf(tz, { hour: 'numeric', minute: '2-digit', hour12: true }, 'en-US').format(ms);
export const fmtDateTime = (ms, tz) => `${fmtDay(ms, tz)}, ${fmtTime(ms, tz)}`;
export const dayKey = (ms, tz) => dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(ms);
export const monthTitle = (y, m) => dtf('UTC', { month: 'long', year: 'numeric' }).format(Date.UTC(y, m, 1));

/** "19:00" (academy time) -> "7:00 PM" */
export const fmtClock = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return fmtTime(Date.UTC(2000, 0, 1, h, m), 'UTC'); };
/** Academy clock time converted to the student's timezone (using today's date). */
export function istToLocal(hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number), n = new Date();
  return fmtTime(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), h, m) - 330 * 60e3, tz);
}
export const money = (price, currency) => price == null ? null :
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: price % 1 ? 2 : 0 }).format(price);
export const PERIOD = { month: 'month', course: 'course', session: 'session' };
