let csrf = null;
export const setCsrf = (v) => { csrf = v; };

/** All server calls go through here: same-origin cookies + CSRF header on every write. */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const e = new Error(data?.error || 'Something went wrong');
    e.status = res.status; e.details = data?.details;
    throw e;
  }
  return data;
}
