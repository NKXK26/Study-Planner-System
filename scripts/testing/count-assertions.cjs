// Count executed assertion calls in the suite itself, not library internals.
// This is not a count of independent test cases or a code coverage measure.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const load = Module._load;
const suite = path.resolve(process.env.FYP_ASSERTION_SUITE || '');
const target = process.env.FYP_ASSERTION_OUTPUT;
const counts = {executed: 0, passed: 0, failed: 0, pending: 0, byMethod: {}};
const methods = new Set(['ok','equal','notEqual','deepEqual','notDeepEqual','strictEqual','notStrictEqual','deepStrictEqual','notDeepStrictEqual','throws','doesNotThrow','rejects','doesNotReject','ifError','match','doesNotMatch','fail','partialDeepStrictEqual']);
function call(fn, receiver, args, method) {
  counts.executed++;counts.pending++;
  counts.byMethod[method] = (counts.byMethod[method] || 0) + 1;
  const pass = value => {counts.passed++;counts.pending--;return value;};
  const fail = error => {counts.failed++;counts.pending--;throw error;};
  let value;
  try {value = Reflect.apply(fn, receiver, args);} catch (error) {return fail(error);}
  return value && typeof value.then === 'function' ? value.then(pass, fail) : pass(value);
}
Module._load = function(request, parent, isMain) {
  const exported = Reflect.apply(load, this, arguments);
  if (!['node:assert/strict','assert/strict'].includes(request) || path.resolve(parent?.filename || '') !== suite) return exported;
  const cache = new Map();
  return new Proxy(exported, {
    apply(fn, receiver, args) {return call(fn, receiver, args, 'assert');},
    get(fn, key, receiver) {
      const value = Reflect.get(fn, key, receiver);
      if (!methods.has(key) || typeof value !== 'function') return value;
      if (!cache.has(key)) cache.set(key, (...args) => call(value, fn, args, key));
      return cache.get(key);
    },
  });
};
process.on('exit', () => {if (target) fs.writeFileSync(target, JSON.stringify(counts, null, 2) + '\n');});
