import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayKey, fmtDayLong, monthTitle } from '../lib/time.js';
import ClassRow from './ClassRow.jsx';

const HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');

export default function Calendar({ bookings, tz, cancelHours, onChanged }) {
  const today = dayKey(Date.now(), tz);
  const [cur, setCur] = useState(() => ({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }));
  const [sel, setSel] = useState(today);

  const byDay = useMemo(() => {
    const map = {};
    for (const b of bookings) (map[dayKey(b.startsAt, tz)] ||= []).push(b);
    return map;
  }, [bookings, tz]);

  const first = new Date(Date.UTC(cur.y, cur.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(cur.y, cur.m + 1, 0)).getUTCDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: dim }, (_, i) => `${cur.y}-${pad(cur.m + 1)}-${pad(i + 1)}`)];
  const move = (d) => setCur(({ y, m }) => { const n = new Date(Date.UTC(y, m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });
  const selected = byDay[sel] || [];

  return (
    <div className="cal-layout">
      <div className="panel">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft /></button>
          <strong>{monthTitle(cur.y, cur.m)}</strong>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><ChevronRight /></button>
        </div>
        <div className="cal-grid" role="grid">
          {HEAD.map((h) => <div key={h} className="cal-dow">{h}</div>)}
          {cells.map((k, i) => {
            if (!k) return <div key={'e' + i} className="cal-cell empty" />;
            const list = byDay[k] || [];
            const live = list.filter((b) => b.status === 'booked' || b.status === 'attended');
            return (
              <button key={k} className={`cal-cell${k === today ? ' today' : ''}${k === sel ? ' sel' : ''}${live.length ? ' has' : ''}`}
                onClick={() => setSel(k)} aria-label={`${k}, ${live.length} classes`}>
                <span>{+k.slice(8)}</span>
                {live.length > 0 && <i className="dots">{live.slice(0, 3).map((b) => <b key={b.bookingId} className={b.kind === 'group' ? 'g' : 'o'} />)}</i>}
              </button>
            );
          })}
        </div>
        <div className="legend"><span><b className="g" /> Group</span><span><b className="o" /> One-on-one</span></div>
      </div>

      <div className="panel">
        <h3>{fmtDayLong(Date.parse(sel + 'T12:00:00Z'), 'UTC')}</h3>
        {selected.length === 0 ? <p className="muted">No classes this day.</p> :
          selected.map((b) => <ClassRow key={b.bookingId} b={b} tz={tz} cancelHours={cancelHours} onChanged={onChanged} />)}
      </div>
    </div>
  );
}
