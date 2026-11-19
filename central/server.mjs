import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyPassword } from '../src/utils/auth/passwordHash.mjs';
import { change, publicPlanner, fault } from './model.mjs';

export function createCatalogueServer(db, accounts) {
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
      if (req.url === '/catalogue' && req.method === 'GET') {
        const rows = await db.revision.findMany({where:{status:'Published'},orderBy:{id:'asc'}});
        return send(200,{data:rows.map(publicPlanner)});
      }
      if (!['/manage','/revisions'].includes(req.url)) throw fault(404,'Unknown endpoint');
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
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        return res.end(await readFile(new URL('./manage.html',import.meta.url)));
      }
      if (req.url === '/revisions' && req.method === 'GET') return send(200,await db.revision.findMany({orderBy:{id:'desc'},include:{events:true}}));
      if (req.url !== '/revisions' || req.method !== 'POST') throw fault(405,'Unsupported operation');
      // Browsers cannot send this cross-origin without a successful CORS preflight.
      if (req.headers['x-catalogue-write'] !== '1' || req.headers['content-type'] !== 'application/json') throw fault(403,'Invalid publishing request');
      limit('write:'+name,30);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024*1024) throw fault(413,'Planner too large');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks)); } catch { throw fault(400,'Invalid JSON'); }
      if (!body || typeof body !== 'object') throw fault(400,'Invalid request');
      return send(200,await change(db,{name,role:account.role},body));
    } catch (e) {
      const conflict = ['P2002','P2025','P2034'].includes(e.code);
      send(e.status || (conflict ? 409 : 500),{message:e.status ? e.message : conflict ? 'Concurrent change. Reload and retry.' : 'Catalogue operation failed'});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {PrismaClient} = await import('./generated/client/index.js');
  const accounts = JSON.parse(process.env.CATALOGUE_PUBLISHERS || '{}');
  const db = new PrismaClient();
  await db.$connect();
  createCatalogueServer(db,accounts).listen(Number(process.env.CATALOGUE_PORT || 4100),'127.0.0.1');
}
