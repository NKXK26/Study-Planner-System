import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {adaptPublishedPlanningPool} from './officialPlannerAdapter.mjs';

const maxAge = 24*60*60*1000;
const pending = new Map();
export function readOfficialCatalogue({
  url = process.env.PLANNER_CATALOGUE_URL,
  dir = process.env.PLANNER_CACHE_DIR || path.join(os.homedir(),'.study-planner','catalogue'),
  request = fetch,
  timeoutMs = process.env.PLANNER_CATALOGUE_TIMEOUT_MS,
} = {}) {
  if (!url) return Promise.resolve({source:'local',warning:'Using local planners only. Central publishing is not configured.'});
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    !(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['localhost','127.0.0.1'].includes(endpoint.hostname)))) throw Error('Invalid catalogue URL');
  const key = path.join(dir,createHash('sha256').update(url).digest('hex')+'.json');
  const parsedTimeout = Number(timeoutMs);
  const requestTimeout = Number.isFinite(parsedTimeout) && parsedTimeout >= 1000 && parsedTimeout <= 60000 ? parsedTimeout : 6000;
  if (!pending.has(key)) pending.set(key,refresh().finally(()=>pending.delete(key)));
  return pending.get(key);
  async function refresh() {
    let data;
    const valid = items => Array.isArray(items) && items.every(p => p.status === 'Published' && Number.isInteger(p.id) && Number.isInteger(p.version) && p.publishedAt && Array.isArray(p.units) && p.plannerTemplate?.requirements);
    try {
      const response = await request(endpoint,{signal:AbortSignal.timeout(requestTimeout),cache:'no-store',redirect:'error'});
      if (!response.ok) throw Error();
      ({data} = await response.json());
      if (!valid(data)) throw Error();
    } catch {
      const cached = await readFile(key,'utf8').then(JSON.parse).catch(()=>null);
      if (!cached || !valid(cached.data) || !(Date.now()-cached.at >= 0 && Date.now()-cached.at < maxAge)) throw Error('Central catalogue unavailable. No recent published catalogue is cached.');
      return {source:'cache',data:cached.data,warning:'Central catalogue unavailable. Using published planners cached at '+new Date(cached.at).toISOString()+'.'};
    }
    const temp = key+'.'+randomUUID();
    try {
      await mkdir(dir,{recursive:true});
      await writeFile(temp,JSON.stringify({at:Date.now(),data}),{flag:'wx'});
      await rename(temp,key);
    } catch {
      await unlink(temp).catch(()=>{});
      return {source:'central',data,warning:'Published planners loaded. Offline cache could not be saved.'};
    }
    return {source:'central',data};
  }
}

// Adapt published snapshots for existing planning algorithms that consume Prisma relations.
export async function publishedPlanningPool() {
  const catalogue = await readOfficialCatalogue();
  return adaptPublishedPlanningPool(catalogue.data);
}
