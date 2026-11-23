import http from 'node:http';
import {randomBytes} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyPassword } from './passwordHash.mjs';
import { readConfig } from './config.mjs';
import { change, publicPlanner, fault, CatalogueFault } from './model.mjs';
import { createBulkImporter } from './bulk-drafts.mjs';
import { bulkBodyLimit } from './bulk-review.mjs';

export function createCatalogueServer(db, accounts) {
  const bulkImport = createBulkImporter(db);
  const windows = new Map();
  function limit(key, max) {
    const now = Date.now();
    if (windows.size > 5000) for (const [k,v] of windows) if (v.until <= now) windows.delete(k);
    let entry = windows.get(key);
    if (!entry || entry.until <= now) windows.set(key, entry = {n:0,until:now+60000});
    if (++entry.n > max) throw fault(429,'Too many requests. Try again in a minute.');
  }
  return http.createServer(async (req,res) => {
    const send = (status, data) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if (req.url === '/health' && req.method === 'GET') {
        try {
          await db.$queryRaw`SELECT 1`;
        } catch {
          return send(503, {status:'unavailable'});
        }
        return send(200, {status:'ok'});
      }
      if (req.url === '/catalogue' && req.method === 'GET') {
        const rows = await db.revision.findMany({where:{status:'Published'},orderBy:{id:'asc'}});
        return send(200,{data:rows.map(publicPlanner)});
      }
      const bulk = ['/revisions/bulk/plan','/revisions/bulk/apply'].includes(req.url);
      if (!bulk && !['/manage','/revisions'].includes(req.url)) throw fault(404,'Unknown endpoint');
      limit(req.socket.remoteAddress,120);
      const auth = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(req.headers.authorization || '');
      const value = auth ? Buffer.from(auth[1],'base64').toString() : '';
      const separator = value.indexOf(':');
      const name = value.slice(0,separator);
      const account = Object.hasOwn(accounts,name) && accounts[name];
      if (!account || !(await verifyPassword(value.slice(separator+1),account.hash))) {
        res.setHeader('WWW-Authenticate','Basic realm="Planner publishing", charset="UTF-8"');
        throw fault(401,'Publisher login required');
      }
      if (!['Admin','HOD'].includes(account.role)) throw fault(403,'Publisher access required');
      if (req.method === 'GET' && req.url === '/manage') {
        const nonce = randomBytes(18).toString('base64');
        const html = await readFile(new URL('./manage.html',import.meta.url),'utf8');
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
        return res.end(html.replace(/<(script|style)>/g,`<$1 nonce="${nonce}">`));
      }
      if (req.url === '/revisions' && req.method === 'GET') return send(200,await db.revision.findMany({orderBy:{id:'desc'},include:{events:true}}));
      if ((!bulk && req.url !== '/revisions') || req.method !== 'POST') throw fault(405,'Unsupported operation');
      // Browsers cannot send this cross-origin without a successful CORS preflight.
      if (req.headers['x-catalogue-write'] !== '1' || req.headers['content-type'] !== 'application/json') throw fault(403,'Invalid publishing request');
      limit('write:'+name,30);
      const chunks = [];
      let size = 0;
      const maxBytes = bulk ? bulkBodyLimit : 1024*1024;
      if (Number(req.headers['content-length']) > maxBytes) throw fault(413,'Planner request too large');
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) throw fault(413,'Planner request too large');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks)); } catch { throw fault(400,'Invalid JSON'); }
      if (!body || typeof body !== 'object') throw fault(400,'Invalid request');
      if (bulk) {
        const result = await bulkImport({name,role:account.role},body,req.url.endsWith('/apply'));
        return send(result.ok ? 200 : result.conflicts.length ? 409 : 422,result);
      }
      return send(200,await change(db,{name,role:account.role},body));
    } catch (e) {
      const conflict = ['P2002','P2025','P2034'].includes(e.code);
      if (e instanceof CatalogueFault) return send(e.status, {message:e.message});
      send(conflict ? 409 : 500,{message:conflict ? 'Concurrent change. Reload and retry.' : 'Catalogue operation failed'});
    }
  });
}

export async function startCatalogue({host, port, accounts}, db) {
  const server = createCatalogueServer(db, accounts);
  let stopping;
  function stop() {
    if (!stopping) stopping = (async () => {
      const deadline = setTimeout(() => server.closeAllConnections(), 10000);
      try {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally {
        clearTimeout(deadline);
        await db.$disconnect();
      }
    })();
    return stopping;
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
  return {server, stop};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let config;
  try { config = readConfig(process.env); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  if (config) {
    try {
      const {createCatalogueClient} = await import('./database.mjs');
      const {stop} = await startCatalogue(config, createCatalogueClient(config.databaseUrl));
      const shutdown = () => stop().catch(() => {
        console.error('Catalogue shutdown failed.');
        process.exitCode = 1;
      });
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch {
      console.error('Catalogue startup failed. Check the listener and generated client.');
      process.exitCode = 1;
    }
  }
}
