import { useCallback, useEffect, useState } from 'react';

/** Tiny data-loading hook: { data, error, loading, reload } */
export function useLoad(fn, deps = []) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setS((p) => ({ ...p, loading: true, error: null }));
    fn().then((data) => alive && setS({ data, error: null, loading: false }))
        .catch((e) => alive && setS({ data: null, error: e.message, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  // Only show the loading state on the first load; reloads keep the page mounted (no flicker, messages survive).
  return { ...s, loading: s.loading && s.data === null, reload };
}

export const Loading = () => <div className="muted pad" aria-busy="true">Loading…</div>;
export const ErrorBox = ({ msg }) => (msg ? <div className="alert error" role="alert">{msg}</div> : null);
export const OkBox = ({ msg }) => (msg ? <div className="alert ok" role="status">{msg}</div> : null);
export const Badge = ({ tone = 'gray', children }) => <span className={`badge ${tone}`}>{children}</span>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
/** Only ever render https links that came from the server. */
export const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : null);

const STATUS_TONE = { booked: 'blue', attended: 'green', missed: 'red', cancelled: 'gray', active: 'green', pending: 'amber', paused: 'gray' };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] || 'gray'}>{status}</Badge>;

export function useMessage() {
  const [msg, setMsg] = useState({ ok: '', err: '' });
  return [msg, { ok: (ok) => setMsg({ ok, err: '' }), err: (e) => setMsg({ ok: '', err: e?.message || String(e) }), clear: () => setMsg({ ok: '', err: '' }) }];
}
