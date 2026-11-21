const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

function loadClientModule(file, imports) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => {
    if (!(name in imports)) throw Error('Unexpected import ' + name);
    return imports[name];
  });
  return exports.default;
}

async function testBrowserCache() {
  const key = '/api/official-planners';
  const failure = { success: false, message: 'Unavailable' };
  const success = { success: true, data: ['published'] };
  // Simulate an IndexedDB entry written by the previous version.
  let stored = { data: failure, expiryTime: Date.now() + 180000 };
  let reads = 0;
  let writes = 0;
  const storage = {
    async getItem() { reads++; return stored; },
    async setItem(_key, entry) { writes++; stored = entry; },
  };
  const DataCacher = loadClientModule('src/utils/db/DataCacher.js', {
    localforage: { createInstance: () => storage },
  });
  const Helper = loadClientModule('src/utils/auth/FrontendAuthHelper.js', {
    '@utils/db/DataCacher': DataCacher, sweetalert2: {}, '@app/msalInstance': {},
    '@app/libs/studentPortalAccess.mjs': {},
  });
  Helper.isDevMode = () => true;
  const responses = [
    Response.json(failure, { status: 503 }), Response.json(success, { status: 203 }),
    Response.json(failure), Response.json(failure),
  ];
  const originalFetch = global.fetch;
  global.fetch = async () => responses.shift();
  try {
    assert.equal((await Helper.authenticatedFetch(key)).status, 503);
    assert.equal(writes, 0);
    const recovered = await Helper.authenticatedFetch(key);
    assert.deepEqual(await recovered.json(), success);
    assert.equal(writes, 1);
    const hit = await Helper.authenticatedFetch(key);
    assert.equal(hit.status, 203);
    assert.deepEqual(await hit.json(), success);
    const previousReads = reads;
    assert.deepEqual(await (await Helper.authenticatedFetch(key, { cache: 'no-store' })).json(), failure);
    assert.equal(reads, previousReads);
    assert.equal(writes, 1);
    stored = null;
    assert.deepEqual(await (await Helper.authenticatedFetch(key)).json(), failure);
    assert.equal(writes, 1);
    assert.equal(responses.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testCentralCache() {
  const { readOfficialCatalogue } = await import('../src/app/libs/officialCatalogue.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-cache-test-'));
  const data = [{ id: 1, version: 1, status: 'Published', publishedAt: '2026-01-01',
    units: [], plannerTemplate: { requirements: [] } }];
  const read = (request, timeoutMs = 1000) => readOfficialCatalogue({
    url: 'https://catalogue.invalid/catalogue', dir, request, timeoutMs,
  });
  try {
    for (const transient of [502, 503, 504, 'network']) {
      let attempts = 0;
      const recovered = await read(async () => {
        if (++attempts === 1) {
          if (transient === 'network') throw new TypeError('offline');
          return new Response(null, { status: transient });
        }
        return Response.json({ data });
      });
      assert.equal(attempts, 2);
      assert.deepEqual(recovered, { source: 'central', data });
    }
    for (const status of [403, 503]) {
      let attempts = 0;
      const fallback = await read(async () => {
        attempts++;
        return new Response(null, { status });
      });
      assert.equal(attempts, status === 403 ? 1 : 2);
      assert.equal(fallback.source, 'cache');
      assert.deepEqual(fallback.data, data);
      assert.match(fallback.warning, /cached at/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  await testBrowserCache();
  await testCentralCache();
  console.log('Catalogue response caching, retry and offline fallback passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
