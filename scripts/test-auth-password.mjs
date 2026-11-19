import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/utils/auth/passwordHash.mjs';

const hash = await hashPassword('admin1234');
assert.notEqual(hash, 'admin1234');
assert.match(hash, /^scrypt\$[\da-f]{32}\$[\da-f]{128}$/);
assert.equal(await verifyPassword('admin1234', hash), true);
assert.equal(await verifyPassword('wrong-password', hash), false);
assert.equal(await verifyPassword('admin1234', 'plaintext-admin1234'), false);
console.log('Authentication password hashing tests: OK');
