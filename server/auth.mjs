import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { demoAccounts } from './demo-accounts.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (data, headers = {}) =>
  Response.json(data, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
const tokenOf = (request) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('clara_session='))
    ?.slice(14);
const publicUser = (account) => ({
  id: account.id,
  name: account.name,
  email: account.email,
  role: account.role,
  demo: !!account.demo,
});

async function seedDemo(db) {
  await db.batch(
    demoAccounts.map((a) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO accounts(email,name,role,password_hash,demo) VALUES(?,?,?,?,1)',
        )
        .bind(a.email, a.name, a.role, a.hash),
    ),
  );
}
async function issueSession(request, env, account) {
  const token = randomBytes(32).toString('hex'),
    csrf = randomBytes(24).toString('hex');
  const old = tokenOf(request);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM demo_sessions WHERE expires<? OR token_hash=?').bind(
      Date.now(),
      old ? digest(old) : '',
    ),
    env.DB.prepare(
      'INSERT INTO demo_sessions(token_hash,user_id,role,csrf,expires) VALUES(?,?,?,?,?)',
    ).bind(digest(token), account.id, account.role, csrf, Date.now() + 12 * 3600000),
  ]);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    response: json(
      { user: publicUser(account), csrf },
      {
        'Set-Cookie': `clara_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`,
      },
    ),
  };
}

export async function authenticate(request, env, path) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) fail('Origen no permitido.', 403);
  }
  if (request.method === 'POST' && (path === '/auth/login' || path === '/auth/demo')) {
    const text = await request.text();
    if (text.length > 2000) fail('Solicitud demasiado grande.', 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      fail('Solicitud inválida.');
    }
    if (env.DEMO_MODE === 'true') await seedDemo(env.DB);
    if (path === '/auth/demo') {
      if (env.DEMO_MODE !== 'true') fail('El acceso de demostración está desactivado.', 403);
      const { role } = z.object({ role: z.enum(['owner', 'assistant']) }).parse(input);
      const account = await env.DB.prepare(
        'SELECT * FROM accounts WHERE demo=1 AND role=? ORDER BY id LIMIT 1',
      )
        .bind(role)
        .first();
      return issueSession(request, env, account);
    }
    const data = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(150)
          .transform((x) => x.toLowerCase()),
        password: z.string().min(1).max(128),
      })
      .parse(input);
    const key = digest(`${request.headers.get('CF-Connecting-IP') || 'local'}|${data.email}`),
      now = Date.now();
    const rate = await env.DB.prepare('SELECT count,expires FROM login_limits WHERE key=?')
      .bind(key)
      .first();
    if (rate && rate.expires > now && rate.count >= 10)
      fail('Demasiados intentos. Espera 15 minutos y vuelve a intentar.', 429);
    await env.DB.prepare(
      'INSERT INTO login_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',
    )
      .bind(key, now + 900000, now, now)
      .run();
    const account = await env.DB.prepare('SELECT * FROM accounts WHERE email=?')
      .bind(data.email)
      .first();
    const hash = account?.password_hash || demoAccounts[0].hash;
    const valid = await verifyPassword(data.password, hash);
    if (!account || !valid || (account.demo && env.DEMO_MODE !== 'true'))
      fail('Correo o contraseña incorrectos.', 401);
    await env.DB.prepare('DELETE FROM login_limits WHERE key=? OR expires<?').bind(key, now).run();
    return issueSession(request, env, account);
  }
  const token = tokenOf(request);
  const account = token
    ? await env.DB.prepare(
        'SELECT a.*,s.csrf,s.token_hash FROM demo_sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
      )
        .bind(digest(token), Date.now())
        .first()
    : null;
  if (!account || (account.demo && env.DEMO_MODE !== 'true'))
    fail('Inicia sesión para continuar.', 401);
  if (request.method !== 'GET' && request.headers.get('X-CSRF-Token') !== account.csrf)
    fail('Recarga la página para renovar tu sesión de seguridad.', 403);
  const user = publicUser(account),
    session = { role: account.role, csrf: account.csrf };
  if (request.method === 'GET' && path === '/auth/me')
    return { response: json({ user, csrf: session.csrf }) };
  if (request.method === 'POST' && path === '/auth/logout') {
    await env.DB.prepare('DELETE FROM demo_sessions WHERE token_hash=?')
      .bind(account.token_hash)
      .run();
    return {
      response: json(
        { ok: true },
        { 'Set-Cookie': 'clara_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' },
      ),
    };
  }
  if (request.method === 'POST' && path === '/auth/password') {
    if (account.demo)
      fail('Las contraseñas de demostración son compartidas y no se modifican.', 409);
    const data = z
      .object({ current: z.string().max(128), password: z.string().min(12).max(128) })
      .parse(await request.json());
    if (!(await verifyPassword(data.current, account.password_hash)))
      fail('La contraseña actual no coincide.', 403);
    const hash = await hashPassword(data.password);
    await env.DB.batch([
      env.DB.prepare('UPDATE accounts SET password_hash=? WHERE id=?').bind(hash, account.id),
      env.DB.prepare('DELETE FROM demo_sessions WHERE user_id=? AND token_hash<>?').bind(
        account.id,
        account.token_hash,
      ),
    ]);
    return { response: json({ ok: true }) };
  }
  return { user, session };
}
