import { route } from '../http.js';
import { q } from '../db.js';
import * as S from '../security.js';

export const planOut = (p) => ({
  id: p.id, programId: p.program_id, name: p.name, description: p.description,
  price: p.price_minor == null ? null : p.price_minor / 100, currency: p.currency, billingPeriod: p.billing_period,
  sessionsPerWeek: p.sessions_per_week, sessionMinutes: p.session_minutes, features: JSON.parse(p.features || '[]'), active: !!p.active,
});
export const programOut = (p) => ({ id: p.id, slug: p.slug, name: p.name, kind: p.kind, tagline: p.tagline, description: p.description, parentId: p.parent_id, active: !!p.active });

export function catalogue({ includeInactive = false } = {}) {
  const w = includeInactive ? '' : 'WHERE active=1';
  const plans = q.all(`SELECT * FROM plans ${w} ORDER BY sort_order, id`).map(planOut);
  return q.all(`SELECT * FROM programs ${w} ORDER BY sort_order, id`).map((p) => ({ ...programOut(p), plans: plans.filter((x) => x.programId === p.id) }));
}

route('GET', '/api/public/programs', {}, () => ({ programs: catalogue() }));

route('POST', '/api/public/leads', { limit: { name: 'lead', max: 5, windowMs: 3600e3 } }, ({ body }) => {
  if (body.website) return { ok: true }; // honeypot field: bots fill it, humans never see it
  q.run('INSERT INTO leads(name,email,phone,interest,message,created_at) VALUES(?,?,?,?,?,?)',
    S.str(body.name, 'Name', { min: 2, max: 80 }), S.email(body.email), S.phone(body.phone),
    S.str(body.interest, 'Interest', { optional: true, max: 80 }), S.str(body.message, 'Message', { optional: true, max: 1000, multiline: true }), Date.now());
  return { ok: true };
});
