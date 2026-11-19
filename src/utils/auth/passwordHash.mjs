import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, keyHex] = String(storedHash ?? '').split('$');
  if (algorithm !== 'scrypt' || !/^[\da-f]{32}$/i.test(saltHex ?? '') || !/^[\da-f]{128}$/i.test(keyHex ?? '')) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length));
  return timingSafeEqual(actual, expected);
}
