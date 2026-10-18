import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw new Error('Estas pruebas generan datos ficticios y solo se ejecutan en localhost.');
let cookie = '',
  csrf = '';
async function call(path, method = 'GET', body, extra = {}) {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = r.headers.get('content-type')?.includes('application/json')
    ? await r.json()
    : await r.text();
  return { status: r.status, data };
}
async function login(role) {
  const r = await call('/auth/login', 'POST', {
    email: role === 'owner' ? 'propietario@demo.local' : 'asistente@demo.local',
    password: role === 'owner' ? 'Propietario2026!' : 'Asistente2026!',
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  csrf = r.data.csrf;
}
assert.equal((await call('/dashboard')).status, 401);
assert.equal((await call('/auth/login', 'POST', { role: 'owner' })).status, 400);
assert.equal(
  (await call('/auth/login', 'POST', { email: 'propietario@demo.local', password: 'incorrecta' }))
    .status,
  401,
);
await login('owner');
const ownerCookie = cookie;
assert.equal((await call('/auth/me')).data.user.role, 'owner');
assert.equal(
  (
    await call(
      '/settings',
      'PUT',
      { threshold_cents: 50000, reminder_days: 3, recipient: 'both' },
      { 'X-CSRF-Token': 'bad' },
    )
  ).status,
  403,
);
assert.equal(
  (await call('/auth/demo', 'POST', { role: 'owner' }, { Origin: 'https://elsewhere.invalid' }))
    .status,
  403,
);
const selected = '2027-02';
assert.equal((await call('/months/generate', 'POST', { month: selected })).status, 200);
assert.equal((await call('/months/generate', 'POST', { month: selected })).data.created, 0);
const dashboard = (await call('/dashboard?month=' + selected)).data;
assert.equal(dashboard.bills.filter((b) => b.template_id).length, 6);
assert.equal(dashboard.bills.find((b) => b.title === 'Declaración mensual').due_date, '2027-02-28');
assert.equal(
  (
    await call('/bills', 'POST', {
      title: 'Proveedor inválido',
      supplier_id: 999,
      amount_cents: 500,
      due_date: '2027-02-20',
    })
  ).status,
  400,
);
const created = await call('/bills', 'POST', {
  title: 'Prueba local ' + Date.now(),
  supplier_id: 1,
  amount_cents: 1000,
  due_date: '2027-02-20',
});
assert.equal(created.status, 201);
const id = created.data.id;
cookie = '';
await login('assistant');
assert.equal((await call('/auth/me', 'GET', undefined, { Cookie: ownerCookie })).status, 200);
assert.equal((await call('/bills/' + id)).data.amount_cents, 1000);
assert.equal(
  (await call('/settings', 'PUT', { threshold_cents: 50000, reminder_days: 3, recipient: 'both' }))
    .status,
  403,
);
assert.equal((await call('/export')).status, 403);
const receipt = {
  name: 'FICTICIO-NO-VALIDO.pdf',
  mime: 'application/pdf',
  base64: Buffer.from(
    '%PDF-1.4\nSolo demostración automatizada, sin valor fiscal.\n%%EOF',
  ).toString('base64'),
};
const payment = { amount_cents: 500, method: 'Otro', operation: 'DEMO-' + Date.now(), receipt };
assert.equal((await call(`/bills/${id}/payments`, 'POST', payment)).status, 201);
let detail = (await call('/bills/' + id)).data;
assert.equal(detail.status, 'Parcial');
assert.equal(detail.remaining_cents, 500);
assert.ok((await call('/receipts/' + detail.payments[0].receipt_id)).data.startsWith('%PDF-'));
assert.equal((await call(`/bills/${id}/payments`, 'POST', payment)).status, 409);
assert.equal(
  (
    await call(`/bills/${id}/payments`, 'POST', {
      ...payment,
      operation: payment.operation + 'OVER',
      amount_cents: 501,
    })
  ).status,
  409,
);
assert.equal(
  (
    await call('/bills/' + id, 'PATCH', {
      title: 'Edición prohibida',
      supplier_id: 1,
      amount_cents: 1000,
      due_date: '2027-02-20',
    })
  ).status,
  409,
);
assert.equal((await call(`/bills/${id}/checkout`, 'POST', {})).status, 503);
assert.equal(
  (
    await call(`/bills/${id}/payments`, 'POST', {
      ...payment,
      operation: payment.operation + 'FINAL',
    })
  ).status,
  201,
);
assert.equal((await call('/bills/' + id)).data.status, 'Pagado');
await login('owner');
assert.equal((await call('/export')).data.schema_version, 1);
assert.equal((await call('/settings')).data.payment.enabled, false);
const logout = await call('/auth/logout', 'POST', {});
assert.equal(logout.status, 200);
assert.equal((await call('/auth/me')).status, 401);
console.log(
  'PASS: correo/contraseña, error de acceso, sesiones independientes, roles, CSRF/origen, recurrentes idempotentes, fechas, abonos, comprobantes D1, duplicados, sobrepagos, edición bloqueada, exportación protegida, cierre de sesión y checkout desactivado.',
);
