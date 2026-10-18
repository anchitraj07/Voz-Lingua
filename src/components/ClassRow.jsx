import { useState } from 'react';
import { Video, X } from 'lucide-react';
import { api } from '../api.js';
import { fmtDay, fmtTime } from '../lib/time.js';
import { StatusBadge, safeUrl } from './ui.jsx';

export default function ClassRow({ b, tz, cancelHours = 12, onChanged }) {
  const [err, setErr] = useState('');
  const canCancel = b.status === 'booked' && b.startsAt - Date.now() >= cancelHours * 3600e3;
  const link = safeUrl(b.meetingUrl);
  const end = b.startsAt + b.durationMin * 60e3;
  const cancel = async () => {
    if (!window.confirm('Cancel this class?')) return;
    try { await api(`/bookings/${b.bookingId}/cancel`, { method: 'POST' }); onChanged?.(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="class-row">
      <div className={`class-date ${b.kind === 'group' ? 'g' : 'o'}`}><strong>{fmtDay(b.startsAt, tz)}</strong></div>
      <div className="class-main">
        <strong>{b.title}</strong>
        <span>{fmtTime(b.startsAt, tz)} – {fmtTime(end, tz)} · {b.kind === 'group' ? 'Group' : 'One-on-one'}{b.teacher ? ` · ${b.teacher}` : ''}</span>
        {err && <span className="form-error">{err}</span>}
      </div>
      <div className="class-actions">
        <StatusBadge status={b.status} />
        {b.status === 'booked' && link && <a className="btn-sm" href={link} target="_blank" rel="noopener noreferrer"><Video size={14} /> Join</a>}
        {canCancel && <button className="btn-sm danger" onClick={cancel}><X size={14} /> Cancel</button>}
      </div>
    </div>
  );
}
