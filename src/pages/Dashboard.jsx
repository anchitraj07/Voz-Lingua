import { useMemo, useState } from 'react';
import { LayoutDashboard, CreditCard, CalendarPlus, CalendarDays, ListChecks, UserCog, LogOut, Download, Clock, Trophy, Flame, Users, GraduationCap } from 'lucide-react';
import { Link, useRouter } from '../router.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useLoad, Loading, ErrorBox, OkBox, Badge, Empty, Field, StatusBadge, useMessage } from '../components/ui.jsx';
import Calendar from '../components/Calendar.jsx';
import ClassRow from '../components/ClassRow.jsx';
import { ACADEMY_TZ, LEVELS, WEEKDAYS, WEEK_ORDER, browserTz, fmtClock, fmtDateTime, istToLocal, money, PERIOD } from '../lib/time.js';

const NAV = [
  ['/app', 'Overview', LayoutDashboard], ['/app/plan', 'My Plan', CreditCard], ['/app/book', 'Book Classes', CalendarPlus],
  ['/app/calendar', 'Calendar', CalendarDays], ['/app/classes', 'My Classes', ListChecks], ['/app/profile', 'Profile', UserCog],
];

export default function Dashboard() {
  const { path, navigate } = useRouter();
  const { user, logout } = useAuth();
  const Page = { '/app': Overview, '/app/plan': MyPlan, '/app/book': Book, '/app/calendar': CalendarPage, '/app/classes': Classes, '/app/profile': Profile }[path] || Overview;
  return (
    <div className="app">
      <aside className="app-side">
        <Link to="/" className="brand"><img src="/logo.svg" alt="" className="brand-logo" /><span>VOZ <em>LINGUA</em></span></Link>
        <nav>{NAV.map(([to, label, Icon]) => <Link key={to} to={to} className={path === to ? 'on' : ''}><Icon size={18} /> <span>{label}</span></Link>)}</nav>
        <button className="logout" onClick={async () => { await logout(); navigate('/', { replace: true }); }}><LogOut size={18} /> <span>Log out</span></button>
      </aside>
      <main className="app-main">
        <header className="app-top"><div><small>Bonjour,</small><h2>{user.name.split(' ')[0]} 👋</h2></div><Badge tone="blue">Level {user.level}</Badge></header>
        <Page />
      </main>
    </div>
  );
}

/* ---------------- Overview ---------------- */
function Overview() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api('/me/overview'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const { stats, upcoming, subscriptions } = data;
  const open = subscriptions.filter((s) => s.status !== 'cancelled');
  const active = open.filter((s) => s.status === 'active');
  return (
    <>
      {open.length === 0 && <div className="callout"><div><strong>Choose your plan to get started</strong><p>Pick Group Sessions or a Specialised One-on-One plan, then book your days and time slots.</p></div><Link to="/app/plan" className="primary">Choose a plan</Link></div>}
      {open.length > 0 && active.length === 0 && <div className="callout amber"><div><strong>Your plan is awaiting confirmation</strong><p>The VOZ LINGUA team will confirm it shortly. You can book classes once it is active.</p></div></div>}
      {active.length > 0 && stats.upcoming === 0 && <div className="callout"><div><strong>No classes booked yet</strong><p>Choose your batch or weekly slots to fill your calendar.</p></div><Link to="/app/book" className="primary">Book classes</Link></div>}

      <div className="stat-grid">
        <Stat icon={<CalendarDays />} label="Upcoming classes" value={stats.upcoming} />
        <Stat icon={<Trophy />} label="Classes attended" value={stats.attended} />
        <Stat icon={<Clock />} label="Hours learned" value={stats.hoursLearned} />
        <Stat icon={<Flame />} label="Attendance" value={stats.attendanceRate == null ? '—' : stats.attendanceRate + '%'} />
      </div>

      <section className="panel">
        <div className="panel-head"><h3>Next classes</h3><Link to="/app/calendar" className="link">Open calendar →</Link></div>
        {upcoming.length === 0 ? <Empty>Nothing scheduled yet.</Empty> : upcoming.map((b) => <ClassRow key={b.bookingId} b={b} tz={user.timezone} onChanged={reload} />)}
      </section>
      <section className="panel">
        <div className="panel-head"><h3>My plans</h3><Link to="/app/plan" className="link">Manage →</Link></div>
        {open.length === 0 ? <Empty>No plan selected.</Empty> : open.map((s) => <div className="plan-line" key={s.id}><div><strong>{s.plan.name}</strong><span>{s.programName}</span></div><StatusBadge status={s.status} /></div>)}
      </section>
    </>
  );
}
const Stat = ({ icon, label, value }) => <div className="stat"><div className="stat-ic">{icon}</div><strong>{value}</strong><span>{label}</span></div>;

/* ---------------- My Plan ---------------- */
function MyPlan() {
  const subs = useLoad(() => api('/subscriptions'), []);
  const cat = useLoad(() => api('/public/programs'), []);
  const [msg, m] = useMessage();
  if (subs.loading || cat.loading) return <Loading />;
  if (!subs.data || !cat.data) return <ErrorBox msg={subs.error || cat.error} />;
  const open = subs.data.subscriptions.filter((s) => s.status !== 'cancelled');
  const has = (planId) => open.some((s) => s.plan.id === planId);
  const choose = async (planId) => {
    try { await api('/subscriptions', { method: 'POST', body: { planId } }); m.ok('Plan selected. We will confirm it shortly — you can then book your classes.'); subs.reload(); } catch (e) { m.err(e); }
  };
  const cancel = async (id) => {
    if (!window.confirm('Cancel this plan?')) return;
    try { await api(`/subscriptions/${id}/cancel`, { method: 'POST' }); m.ok('Plan cancelled.'); subs.reload(); } catch (e) { m.err(e); }
  };
  return (
    <>
      <ErrorBox msg={msg.err || subs.error || cat.error} /><OkBox msg={msg.ok} />
      {open.length > 0 && (
        <section className="panel">
          <h3>Your plans</h3>
          {open.map((s) => (
            <div className="plan-line" key={s.id}>
              <div><strong>{s.plan.name}</strong><span>{s.programName} · {s.plan.sessionsPerWeek}×/week · {s.plan.sessionMinutes} min</span></div>
              <div className="row-gap"><StatusBadge status={s.status} /><button className="btn-sm danger" onClick={() => cancel(s.id)}>Cancel</button></div>
            </div>
          ))}
        </section>
      )}
      <h3 className="section-title">Available programs</h3>
      <div className="program-grid app-programs">
        {(cat.data?.programs || []).map((p) => (
          <article className="panel plan-card" key={p.id}>
            <div className="program-icon">{p.kind === 'group' ? <Users /> : <GraduationCap />}</div>
            <h3>{p.name}</h3><p className="muted">{p.tagline}</p>
            {p.plans.map((pl) => (
              <div className="plan-mini" key={pl.id}>
                <div className="plan-mini-top"><strong>{pl.name}</strong><span>{pl.price == null ? 'Pricing coming soon' : `${money(pl.price, pl.currency)} / ${PERIOD[pl.billingPeriod]}`}</span></div>
                <p className="muted small">{pl.description}</p>
                <ul>{pl.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                <button className="primary full" disabled={has(pl.id)} onClick={() => choose(pl.id)}>{has(pl.id) ? 'Selected' : 'Choose this plan'}</button>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

/* ---------------- Book ---------------- */
function Book() {
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api('/subscriptions'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const active = data.subscriptions.filter((s) => s.status === 'active');
  const programs = [...new Map(active.map((s) => [s.plan.programId, s])).values()];
  if (!programs.length) return <Empty>You need an active plan before you can book classes. <Link to="/app/plan" className="link">Choose a plan →</Link></Empty>;
  return (
    <>
      <p className="muted note">Class times are set in Indian Standard Time (IST). {user.timezone !== ACADEMY_TZ && `Your local time (${user.timezone}) is shown alongside.`}</p>
      {programs.map((s) => s.programKind === 'group'
        ? <GroupBooking key={s.plan.programId} programId={s.plan.programId} name={s.programName} tz={user.timezone} />
        : <OneOnOneBooking key={s.plan.programId} programId={s.plan.programId} name={s.programName} tz={user.timezone} />)}
    </>
  );
}

function GroupBooking({ programId, name, tz }) {
  const { data, error, loading, reload } = useLoad(() => api(`/programs/${programId}/batches`), [programId]);
  const [msg, m] = useMessage();
  const act = async (id, verb) => {
    try { await api(`/batches/${id}/${verb}`, { method: 'POST' }); m.ok(verb === 'join' ? 'You are in! The classes are now on your calendar.' : 'You left the batch. Classes starting within the cancellation window stay booked.'); reload(); } catch (e) { m.err(e); }
  };
  return (
    <section className="panel">
      <h3>{name} — choose your batch</h3>
      <ErrorBox msg={msg.err || error} /><OkBox msg={msg.ok} />
      {loading ? <Loading /> : !data ? null : data.batches.length === 0 ? <Empty>No batches are open right now. Please check back soon.</Empty> : (
        <div className="batch-grid">
          {data.batches.map((b) => (
            <div className={`batch${b.joined ? ' joined' : ''}`} key={b.id}>
              <div className="batch-top"><strong>{b.title}</strong><Badge tone="blue">{b.level}</Badge></div>
              <div className="chips">{WEEK_ORDER.map((d) => <i key={d} className={b.weekdays.includes(d) ? 'on' : ''}>{WEEKDAYS[d]}</i>)}</div>
              <p><Clock size={14} /> {fmtClock(b.startTime)} IST · {b.durationMin} min{tz !== ACADEMY_TZ && <> ({istToLocal(b.startTime, tz)} your time)</>}</p>
              <p className="muted small">Next class: {fmtDateTime(b.nextSessionAt, tz)} · {b.sessionsRemaining} classes left · {b.seatsLeft} seat{b.seatsLeft === 1 ? '' : 's'} left</p>
              {b.joined
                ? <button className="secondary full" onClick={() => act(b.id, 'leave')}>Leave batch</button>
                : <button className="primary full" disabled={b.seatsLeft === 0} onClick={() => act(b.id, 'join')}>{b.seatsLeft === 0 ? 'Batch full' : 'Join this batch'}</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OneOnOneBooking({ programId, name, tz }) {
  const { data, error, loading } = useLoad(() => api(`/programs/${programId}/slots`), [programId]);
  const [picked, setPicked] = useState([]);
  const [start, setStart] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [msg, m] = useMessage();
  const [conf, setConf] = useState([]);
  const [busy, setBusy] = useState(false);
  const byDay = useMemo(() => { const o = {}; for (const s of data?.slots || []) (o[s.weekday] ||= []).push(s); return o; }, [data]);
  if (loading) return <section className="panel"><Loading /></section>;
  if (error) return <ErrorBox msg={error} />;
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < data.maxPerWeek ? [...p, id] : p));
  const book = async () => {
    setBusy(true); setConf([]);
    try {
      const r = await api('/one-on-one/book', { method: 'POST', body: { programId, availabilityIds: picked, startDate: start || data.minDate, weeks } });
      m.ok(`Booked ${r.created} classes. Find them in your calendar.`); setPicked([]);
    } catch (e) { m.err(e); setConf(e.details?.conflicts || []); }
    setBusy(false);
  };
  return (
    <section className="panel">
      <h3>{name} — pick your days & time slots</h3>
      <p className="muted small">Your plan includes up to <strong>{data.maxPerWeek}</strong> session{data.maxPerWeek === 1 ? '' : 's'} per week. Choose the weekly slots you want; they repeat every week.</p>
      <ErrorBox msg={msg.err} /><OkBox msg={msg.ok} />
      {conf.length > 0 && <div className="alert error">Taken: {conf.slice(0, 6).map((c) => `${c.date} ${fmtClock(c.time)}`).join(', ')}{conf.length > 6 ? '…' : ''}</div>}
      {data.slots.length === 0 ? <Empty>No slots are published yet.</Empty> : (
        <div className="slot-grid">
          {WEEK_ORDER.filter((d) => byDay[d]).map((d) => (
            <div key={d} className="slot-col">
              <h4>{WEEKDAYS[d]}</h4>
              {byDay[d].map((s) => {
                const on = picked.includes(s.id);
                return <button key={s.id} className={`slot${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && picked.length >= data.maxPerWeek} onClick={() => toggle(s.id)}>
                  {fmtClock(s.startTime)}{tz !== ACADEMY_TZ && <small>{istToLocal(s.startTime, tz)} you</small>}</button>;
              })}
            </div>
          ))}
        </div>
      )}
      <div className="book-controls">
        <Field label="Start from"><input type="date" min={data.minDate} max={data.maxDate} value={start || data.minDate} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="For how many weeks"><select value={weeks} onChange={(e) => setWeeks(+e.target.value)}>{[1, 2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}</select></Field>
        <button className="primary" disabled={!picked.length || busy} onClick={book}>{busy ? 'Booking…' : `Book ${picked.length * weeks || ''} classes`}</button>
      </div>
    </section>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api('/bookings'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  return (
    <>
      <div className="row-between"><p className="muted">Times shown in <strong>{user.timezone}</strong>. Change this in Profile.</p><a className="btn-sm" href="/api/calendar.ics"><Download size={14} /> Add to Google/Apple Calendar (.ics)</a></div>
      <Calendar bookings={data.bookings} tz={user.timezone} cancelHours={data.cancelHours} onChanged={reload} />
    </>
  );
}

/* ---------------- My Classes ---------------- */
function Classes() {
  const { user } = useAuth();
  const [tab, setTab] = useState('upcoming');
  const { data, error, loading, reload } = useLoad(() => api('/bookings'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const now = Date.now();
  const isUp = (b) => b.status === 'booked' && b.startsAt + b.durationMin * 60e3 > now;
  const list = data.bookings.filter((b) => (tab === 'upcoming' ? isUp(b) : !isUp(b)));
  if (tab === 'past') list.reverse();
  return (
    <section className="panel">
      <div className="tabs">{['upcoming', 'past'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'upcoming' ? 'Upcoming' : 'Past & cancelled'}</button>)}</div>
      {list.length === 0 ? <Empty>No classes here yet.</Empty> : list.map((b) => <ClassRow key={b.bookingId} b={b} tz={user.timezone} cancelHours={data.cancelHours} onChanged={reload} />)}
      <p className="muted small">Classes can be cancelled up to {data.cancelHours} hours before they start.</p>
    </section>
  );
}

/* ---------------- Profile ---------------- */
function Profile() {
  const { user, setUser, logout, forgetSession } = useAuth();
  const { navigate } = useRouter();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '', level: user.level, timezone: user.timezone });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [del, setDel] = useState('');
  const [a, ma] = useMessage(); const [b, mb] = useMessage(); const [c, mc] = useMessage();
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return [ACADEMY_TZ, 'UTC']; } }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="profile-grid">
      <form className="panel" onSubmit={async (e) => { e.preventDefault(); try { const r = await api('/me', { method: 'PATCH', body: f }); setUser(r.user); ma.ok('Profile saved'); } catch (x) { ma.err(x); } }}>
        <h3>Your details</h3><ErrorBox msg={a.err} /><OkBox msg={a.ok} />
        <Field label="Full name"><input required minLength={2} maxLength={80} value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input value={user.email} disabled /></Field>
        <Field label="Phone"><input type="tel" maxLength={20} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="French level"><select value={f.level} onChange={set('level')}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Timezone" hint={`Detected: ${browserTz()}`}><select value={f.timezone} onChange={set('timezone')}>{[...new Set([f.timezone, ...zones])].map((z) => <option key={z}>{z}</option>)}</select></Field>
        <button className="primary">Save changes</button>
      </form>

      <div>
        <form className="panel" onSubmit={async (e) => { e.preventDefault(); try { await api('/me/password', { method: 'POST', body: pw }); setPw({ currentPassword: '', newPassword: '' }); mb.ok('Password changed. Other devices were signed out.'); } catch (x) { mb.err(x); } }}>
          <h3>Change password</h3><ErrorBox msg={b.err} /><OkBox msg={b.ok} />
          <Field label="Current password"><input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 10 characters with letters and numbers"><input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <button className="primary">Update password</button>
        </form>

        <div className="panel">
          <h3>Security</h3>
          <button className="secondary" onClick={async () => { try { await api('/auth/logout-all', { method: 'POST' }); forgetSession(); navigate('/login'); } catch (x) { mc.err(x); } }}>Log out of all devices</button>
        </div>

        <form className="panel danger-zone" onSubmit={async (e) => { e.preventDefault(); if (!window.confirm('This permanently deletes your account and bookings. Continue?')) return; try { await api('/me', { method: 'DELETE', body: { password: del } }); forgetSession(); navigate('/', { replace: true }); } catch (x) { mc.err(x); } }}>
          <h3>Delete account</h3><ErrorBox msg={c.err} />
          <p className="muted small">Removes your profile, plans and bookings permanently.</p>
          <Field label="Confirm with your password"><input type="password" required autoComplete="current-password" value={del} onChange={(e) => setDel(e.target.value)} /></Field>
          <button className="btn-sm danger solid">Delete my account</button>
        </form>
      </div>
    </div>
  );
}
