import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function isPasswordHash(value) {
  return typeof value === 'string' && /^scrypt\$[\da-f]{32}\$[\da-f]{128}$/i.test(value)
    && value.startsWith('scrypt$');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (!isPasswordHash(storedHash)) return false;
  const [, saltHex, keyHex] = storedHash.split('$');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length));
  return timingSafeEqual(actual, expected);
}
