import { useState } from 'react';
import { Link, useRouter } from '../router.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useLoad, Loading, ErrorBox, OkBox, Badge, Empty, Field, StatusBadge, useMessage, safeUrl } from '../components/ui.jsx';
import { ACADEMY_TZ, LEVELS, WEEKDAYS, WEEK_ORDER, fmtClock, fmtDateTime } from '../lib/time.js';

const TABS = [['', 'Overview'], ['students', 'Students'], ['plans', 'Plans & Pricing'], ['batches', 'Group Batches'], ['slots', '1:1 Slots'], ['sessions', 'Sessions & Attendance'], ['leads', 'Enquiries']];

export default function Admin() {
  const { path, navigate } = useRouter();
  const { logout } = useAuth();
  const tab = path.replace(/^\/admin\/?/, '');
  const Page = { '': Overview, students: Students, plans: Plans, batches: Batches, slots: Slots, sessions: Sessions, leads: Leads }[tab] || Overview;
  return (
    <div className="admin">
      <header className="admin-top">
        <Link to="/" className="brand"><img src="/logo.svg" alt="" className="brand-logo" /><span>VOZ <em>LINGUA</em></span></Link>
        <Badge tone="amber">Admin</Badge>
        <button className="btn-sm" onClick={async () => { await logout(); navigate('/', { replace: true }); }}>Log out</button>
      </header>
      <nav className="admin-tabs">{TABS.map(([k, l]) => <Link key={k} to={'/admin' + (k ? '/' + k : '')} className={tab === k ? 'on' : ''}>{l}</Link>)}</nav>
      <div className="admin-body"><Page /></div>
    </div>
  );
}

function Overview() {
  const { data, error, loading, reload } = useLoad(() => api('/admin/overview'), []);
  const [msg, m] = useMessage();
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  const decide = async (id, status) => { try { await api(`/admin/subscriptions/${id}`, { method: 'POST', body: { status } }); reload(); } catch (e) { m.err(e); } };
  return (
    <>
      <div className="stat-grid">
        <div className="stat"><strong>{data.students}</strong><span>Students</span></div>
        <div className="stat"><strong>{data.pending.length}</strong><span>Plans awaiting approval</span></div>
        <div className="stat"><strong>{data.upcomingClasses}</strong><span>Upcoming classes</span></div>
        <div className="stat"><strong>{data.leads}</strong><span>Website enquiries</span></div>
      </div>
      <section className="panel"><h3>Plans awaiting approval</h3><ErrorBox msg={msg.err} />
        {data.pending.length === 0 ? <Empty>Nothing pending.</Empty> : data.pending.map((p) => (
          <div className="plan-line" key={p.id}><div><strong>{p.name}</strong><span>{p.email} · {p.planName}</span></div>
            <div className="row-gap"><button className="btn-sm solid" onClick={() => decide(p.id, 'active')}>Approve</button><button className="btn-sm danger" onClick={() => decide(p.id, 'cancelled')}>Reject</button></div></div>))}
      </section>
    </>
  );
}

function Students() {
  const { data, error, loading, reload } = useLoad(() => api('/admin/students'), []);
  const [msg, m] = useMessage();
  if (loading) return <Loading />;
  if (!data) return <ErrorBox msg={error} />;
  const toggle = async (s) => { try { await api(`/admin/students/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }); reload(); } catch (e) { m.err(e); } };
  return (
    <section className="panel"><ErrorBox msg={error || msg.err} />
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Level</th><th>Plans</th><th>Attended</th><th>Joined</th><th /></tr></thead><tbody>
        {data.students.map((s) => (
          <tr key={s.id} className={s.isActive ? '' : 'dim'}><td>{s.name}</td><td>{s.email}</td><td>{s.level}</td><td>{s.plans || '—'}</td><td>{s.attended}</td><td>{new Date(s.createdAt).toLocaleDateString()}</td>
            <td><button className="btn-sm" onClick={() => toggle(s)}>{s.isActive ? 'Disable' : 'Enable'}</button></td></tr>))}
      </tbody></table></div>
      {data.students.length === 0 && <Empty>No students yet.</Empty>}
    </section>
  );
}

/* ---------- Plans & pricing: every name and price is editable here ---------- */
function Plans() {
  const { data, error, loading, reload } = useLoad(() => api('/admin/catalogue'), []);
  const [msg, m] = useMessage();
  const [np, setNp] = useState({ name: '', kind: 'group', parentId: '' });
  if (loading) return <Loading />;
  if (!data) return <ErrorBox msg={error} />;
  const addProgram = async (e) => {
    e.preventDefault();
    try { await api('/admin/programs', { method: 'POST', body: { ...np, parentId: np.parentId ? +np.parentId : null } }); setNp({ name: '', kind: 'group', parentId: '' }); m.ok('Program added'); reload(); } catch (x) { m.err(x); }
  };
  return (
    <>
      <ErrorBox msg={error || msg.err} /><OkBox msg={msg.ok} />
      <p className="muted">Leave the price empty to show "Pricing coming soon". Add new programs (branches) any time — e.g. Business French or Exam Prep under Specialised.</p>
      {data.programs.map((p) => <ProgramEditor key={p.id} program={p} parent={data.programs.find((x) => x.id === p.parentId)} onSaved={reload} />)}
      <form className="panel inline-form" onSubmit={addProgram}>
        <h3>Add a new program / branch</h3>
        <Field label="Name"><input required maxLength={80} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /></Field>
        <Field label="Type"><select value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}><option value="group">Group sessions</option><option value="one_on_one">One-on-one</option></select></Field>
        <Field label="Branch of (optional)"><select value={np.parentId} onChange={(e) => setNp({ ...np, parentId: e.target.value })}><option value="">— top level —</option>{data.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <button className="primary">Add program</button>
      </form>
    </>
  );
}

function ProgramEditor({ program, parent, onSaved }) {
  const [f, setF] = useState({ name: program.name, tagline: program.tagline || '', description: program.description || '', active: program.active });
  const [msg, m] = useMessage();
  const [adding, setAdding] = useState(false);
  const save = async () => { try { await api(`/admin/programs/${program.id}`, { method: 'PATCH', body: f }); m.ok('Saved'); onSaved(); } catch (e) { m.err(e); } };
  return (
    <section className="panel">
      <div className="panel-head"><h3>{program.name} {parent && <small className="muted">(branch of {parent.name})</small>}</h3><Badge tone={program.kind === 'group' ? 'blue' : 'amber'}>{program.kind === 'group' ? 'Group' : 'One-on-one'}</Badge></div>
      <ErrorBox msg={msg.err} /><OkBox msg={msg.ok} />
      <div className="form-grid">
        <Field label="Program name"><input maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tagline"><input maxLength={140} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> <span>Visible on website</span></label>
      </div>
      <button className="btn-sm solid" onClick={save}>Save program</button>
      <h4>Plans</h4>
      {program.plans.map((pl) => <PlanEditor key={pl.id} plan={pl} onSaved={onSaved} />)}
      {adding ? <PlanEditor plan={{ name: '', description: '', price: null, currency: 'INR', billingPeriod: 'month', sessionsPerWeek: 2, sessionMinutes: 60, features: [], active: true }} programId={program.id} onSaved={() => { setAdding(false); onSaved(); }} />
        : <button className="btn-sm" onClick={() => setAdding(true)}>+ Add plan</button>}
    </section>
  );
}

function PlanEditor({ plan, programId, onSaved }) {
  const [f, setF] = useState({ ...plan, price: plan.price ?? '', features: plan.features.join('\n') });
  const [msg, m] = useMessage();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    const body = { ...f, price: f.price === '' ? null : Number(f.price), sessionsPerWeek: +f.sessionsPerWeek, sessionMinutes: +f.sessionMinutes, features: f.features.split('\n').map((x) => x.trim()).filter(Boolean) };
    try { await (programId ? api(`/admin/programs/${programId}/plans`, { method: 'POST', body }) : api(`/admin/plans/${plan.id}`, { method: 'PATCH', body })); m.ok('Saved'); onSaved(); } catch (e) { m.err(e); }
  };
  return (
    <div className="plan-editor">
      <ErrorBox msg={msg.err} /><OkBox msg={msg.ok} />
      <div className="form-grid">
        <Field label="Plan name"><input maxLength={80} value={f.name} onChange={set('name')} /></Field>
        <Field label="Price (blank = coming soon)"><input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} /></Field>
        <Field label="Currency"><select value={f.currency} onChange={set('currency')}>{['INR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Billed per"><select value={f.billingPeriod} onChange={set('billingPeriod')}><option value="month">month</option><option value="course">course</option><option value="session">session</option></select></Field>
        <Field label="Sessions / week"><input type="number" min="1" max="14" value={f.sessionsPerWeek} onChange={set('sessionsPerWeek')} /></Field>
        <Field label="Minutes / session"><input type="number" min="15" max="240" value={f.sessionMinutes} onChange={set('sessionMinutes')} /></Field>
      </div>
      <Field label="Description"><textarea rows={2} maxLength={500} value={f.description || ''} onChange={set('description')} /></Field>
      <Field label="Features (one per line)"><textarea rows={4} value={f.features} onChange={set('features')} /></Field>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> <span>Available to students</span></label>
      <button className="btn-sm solid" onClick={save}>{programId ? 'Create plan' : 'Save plan'}</button>
    </div>
  );
}

/* ---------- Group batches ---------- */
function Batches() {
  const list = useLoad(() => api('/admin/batches'), []);
  const cat = useLoad(() => api('/admin/catalogue'), []);
  const [msg, m] = useMessage();
  const blank = { programId: '', title: '', level: 'A1', weekdays: [1, 3, 5], startTime: '19:00', durationMin: 60, capacity: 8, startDate: '', weeks: 8, teacher: '', meetingUrl: '' };
  const [f, setF] = useState(blank);
  if (list.loading || cat.loading) return <Loading />;
  if (!list.data || !cat.data) return <ErrorBox msg={list.error || cat.error} />;
  const groups = cat.data.programs.filter((p) => p.kind === 'group' && p.active);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleDay = (d) => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] });
  const create = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/admin/batches', { method: 'POST', body: { ...f, programId: +(f.programId || groups[0]?.id), durationMin: +f.durationMin, capacity: +f.capacity, weeks: +f.weeks } });
      m.ok(`Batch created with ${r.sessions} classes.`); setF(blank); list.reload();
    } catch (x) { m.err(x); }
  };
  const close = async (id) => { if (!window.confirm('Close this batch and cancel all its future classes?')) return; try { await api(`/admin/batches/${id}/close`, { method: 'POST' }); list.reload(); } catch (x) { m.err(x); } };
  return (
    <>
      <ErrorBox msg={list.error || msg.err} /><OkBox msg={msg.ok} />
      <form className="panel" onSubmit={create}>
        <h3>Create a batch</h3><p className="muted small">Times are in {ACADEMY_TZ} (IST). Classes are generated for every selected weekday.</p>
        <div className="form-grid">
          <Field label="Program"><select value={f.programId || groups[0]?.id || ''} onChange={set('programId')}>{groups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Batch title"><input required maxLength={80} value={f.title} onChange={set('title')} placeholder="A1 Evening Batch" /></Field>
          <Field label="Level"><select value={f.level} onChange={set('level')}>{LEVELS.map(([v]) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Start time (IST)"><input type="time" required value={f.startTime} onChange={set('startTime')} /></Field>
          <Field label="Minutes"><input type="number" min="15" max="240" value={f.durationMin} onChange={set('durationMin')} /></Field>
          <Field label="Seats"><input type="number" min="1" max="100" value={f.capacity} onChange={set('capacity')} /></Field>
          <Field label="First class date"><input type="date" required value={f.startDate} onChange={set('startDate')} /></Field>
          <Field label="Weeks"><input type="number" min="1" max="52" value={f.weeks} onChange={set('weeks')} /></Field>
          <Field label="Tutor"><input maxLength={80} value={f.teacher} onChange={set('teacher')} /></Field>
          <Field label="Meeting link (https://)"><input type="url" value={f.meetingUrl} onChange={set('meetingUrl')} /></Field>
        </div>
        <div className="chips big">{WEEK_ORDER.map((d) => <button type="button" key={d} className={f.weekdays.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{WEEKDAYS[d]}</button>)}</div>
        <button className="primary">Create batch</button>
      </form>
      <section className="panel"><h3>Batches</h3>
        {list.data.batches.length === 0 ? <Empty>No batches yet.</Empty> : list.data.batches.map((b) => (
          <div className="plan-line" key={b.id}><div><strong>{b.title} <Badge tone="blue">{b.level}</Badge></strong>
            <span>{b.weekdays.map((d) => WEEKDAYS[d]).join(' · ')} · {fmtClock(b.startTime)} IST · {b.capacity} seats · {b.upcoming} upcoming classes</span></div>
            {b.active ? <button className="btn-sm danger" onClick={() => close(b.id)}>Close batch</button> : <Badge>closed</Badge>}</div>))}
      </section>
    </>
  );
}

/* ---------- One-on-one availability ---------- */
function Slots() {
  const list = useLoad(() => api('/admin/availability'), []);
  const cat = useLoad(() => api('/admin/catalogue'), []);
  const [msg, m] = useMessage();
  const [f, setF] = useState({ programId: '', weekdays: [1, 2, 3, 4, 5], times: '17:00, 18:00, 19:00', durationMin: 60, teacher: '', meetingUrl: '' });
  if (list.loading || cat.loading) return <Loading />;
  if (!list.data || !cat.data) return <ErrorBox msg={list.error || cat.error} />;
  const progs = cat.data.programs.filter((p) => p.kind === 'one_on_one' && p.active);
  const toggleDay = (d) => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] });
  const add = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/admin/availability', { method: 'POST', body: { programId: +(f.programId || progs[0]?.id), weekdays: f.weekdays, times: f.times.split(/[,\s]+/).filter(Boolean), durationMin: +f.durationMin, teacher: f.teacher, meetingUrl: f.meetingUrl } });
      m.ok(`Added ${r.added} new slot(s).`); list.reload();
    } catch (x) { m.err(x); }
  };
  const remove = async (id) => { try { await api(`/admin/availability/${id}`, { method: 'DELETE' }); list.reload(); } catch (x) { m.err(x); } };
  const byDay = {}; for (const s of list.data.slots) (byDay[s.weekday] ||= []).push(s);
  return (
    <>
      <ErrorBox msg={list.error || msg.err} /><OkBox msg={msg.ok} />
      <form className="panel" onSubmit={add}>
        <h3>Publish weekly slots</h3><p className="muted small">Students pick from these. Times in {ACADEMY_TZ} (24-hour, comma separated).</p>
        <div className="chips big">{WEEK_ORDER.map((d) => <button type="button" key={d} className={f.weekdays.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>{WEEKDAYS[d]}</button>)}</div>
        <div className="form-grid">
          <Field label="Program"><select value={f.programId || progs[0]?.id || ''} onChange={(e) => setF({ ...f, programId: e.target.value })}>{progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Times (HH:MM)"><input value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} /></Field>
          <Field label="Minutes"><input type="number" min="15" max="240" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></Field>
          <Field label="Tutor"><input maxLength={80} value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })} /></Field>
          <Field label="Meeting link (https://)"><input type="url" value={f.meetingUrl} onChange={(e) => setF({ ...f, meetingUrl: e.target.value })} /></Field>
        </div>
        <button className="primary">Add slots</button>
      </form>
      <section className="panel"><h3>Current slots</h3>
        {WEEK_ORDER.filter((d) => byDay[d]).map((d) => (
          <div key={d} className="slot-row"><strong>{WEEKDAYS[d]}</strong>
            <div className="chips">{byDay[d].map((s) => <span key={s.id} className="chip-x">{fmtClock(s.startTime)}{s.teacher ? ` · ${s.teacher}` : ''}<button aria-label="Remove slot" onClick={() => remove(s.id)}>×</button></span>)}</div></div>))}
        {list.data.slots.length === 0 && <Empty>No slots published.</Empty>}
      </section>
    </>
  );
}

/* ---------- Sessions & attendance ---------- */
function Sessions() {
  const { data, error, loading, reload } = useLoad(() => api(`/admin/sessions?from=${Date.now() - 7 * 86400e3}&to=${Date.now() + 30 * 86400e3}`), []);
  const [msg, m] = useMessage();
  if (loading) return <Loading />;
  if (!data) return <ErrorBox msg={error} />;
  const mark = async (id, status) => { try { await api(`/admin/bookings/${id}/status`, { method: 'POST', body: { status } }); reload(); } catch (e) { m.err(e); } };
  const cancel = async (id) => { if (!window.confirm('Cancel this class for everyone?')) return; try { await api(`/admin/sessions/${id}/cancel`, { method: 'POST' }); reload(); } catch (e) { m.err(e); } };
  return (
    <section className="panel"><h3>Last 7 days & next 30 days (IST)</h3><ErrorBox msg={error || msg.err} />
      {data.sessions.length === 0 ? <Empty>No sessions in this range.</Empty> : data.sessions.map((s) => (
        <div className={`sess${s.status === 'cancelled' ? ' dim' : ''}`} key={s.id}>
          <div className="sess-top"><div><strong>{s.title}</strong> <Badge tone={s.kind === 'group' ? 'blue' : 'amber'}>{s.kind === 'group' ? 'Group' : '1:1'}</Badge><span>{fmtDateTime(s.startsAt, ACADEMY_TZ)} · {s.durationMin} min{s.teacher ? ` · ${s.teacher}` : ''}{safeUrl(s.meetingUrl) ? ' · link set' : ''}</span></div>
            {s.status === 'scheduled' ? <button className="btn-sm danger" onClick={() => cancel(s.id)}>Cancel class</button> : <Badge>cancelled</Badge>}</div>
          {s.students.map((a) => <div className="att" key={a.bookingId}><span>{a.name} <small className="muted">{a.email}</small></span>
            <span className="row-gap"><StatusBadge status={a.status} /><button className="btn-sm" onClick={() => mark(a.bookingId, 'attended')}>Present</button><button className="btn-sm" onClick={() => mark(a.bookingId, 'missed')}>Absent</button></span></div>)}
        </div>))}
    </section>
  );
}

function Leads() {
  const { data, error, loading } = useLoad(() => api('/admin/leads'), []);
  if (loading) return <Loading />;
  if (!data) return <ErrorBox msg={error} />;
  return (
    <section className="panel"><ErrorBox msg={error} />
      {data.leads.length === 0 ? <Empty>No enquiries yet.</Empty> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Interest</th></tr></thead><tbody>
        {data.leads.map((l) => <tr key={l.id}><td>{new Date(l.createdAt).toLocaleString()}</td><td>{l.name}</td><td>{l.email}</td><td>{l.interest || '—'}</td></tr>)}</tbody></table></div>}
    </section>
  );
}
