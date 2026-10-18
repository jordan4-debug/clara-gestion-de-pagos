import { randomBytes, timingSafeEqual } from 'node:crypto';
const iterations = 100000;
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${Buffer.from(hash).toString('base64')}`;
}
export async function verifyPassword(password, encoded) {
  const [scheme, rounds, salt, expected] = encoded.split('$');
  if (scheme !== 'pbkdf2-sha256' || Number(rounds) !== iterations || !salt || !expected)
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = Buffer.from(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: Buffer.from(salt, 'base64'), iterations, hash: 'SHA-256' },
      key,
      256,
    ),
  );
  const saved = Buffer.from(expected, 'base64');
  return hash.length === saved.length && timingSafeEqual(hash, saved);
}
