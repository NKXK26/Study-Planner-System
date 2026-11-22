import {readFile,writeFile,stat} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

export async function runCli(args, env, log=console.log) {
  const fail = message => { log(message); return 1; };
  let flags;
  try {
    ({values:flags} = parseArgs({args,options:{
      manifest:{type:'string'},bundle:{type:'string'},url:{type:'string',default:'http://127.0.0.1:4100'},
      apply:{type:'boolean'},'expected-plan':{type:'string'},confirm:{type:'string'},report:{type:'string'}
    }}));
  } catch { return fail('Invalid command options. Supply --manifest and --bundle.'); }
  if (!flags.manifest || !flags.bundle) return fail('Both --manifest and --bundle are required.');
  if (flags.apply && (!/^[0-9a-f]{64}$/.test(flags['expected-plan'] || '') || flags.confirm !== 'IMPORT DRAFTS')) {
    return fail('Apply requires --expected-plan from your dry run and --confirm "IMPORT DRAFTS".');
  }
  let base;
  try { base = new URL(flags.url); } catch { return fail('Invalid catalogue origin.'); }
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      !(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname)))) {
    return fail('Use an HTTPS catalogue origin or local loopback HTTP.');
  }
  const user = env.CATALOGUE_PUBLISHER_USER, password = env.CATALOGUE_PUBLISHER_PASSWORD;
  if (!user || user.includes(':') || !password) return fail('Supply publisher credentials through the process environment.');
  try {
    if ((await stat(flags.manifest)).size + (await stat(flags.bundle)).size > 4*1024*1024) return fail('Batch files exceed 4 MiB.');
    const body = {manifest:await readFile(flags.manifest,'utf8'),bundle:await readFile(flags.bundle,'utf8')};
    if (flags.apply) Object.assign(body,{planFingerprint:flags['expected-plan'],confirmation:flags.confirm});
    const response = await fetch(new URL('/revisions/bulk/'+(flags.apply?'apply':'plan'),base),{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),
      headers:{'Content-Type':'application/json','X-Catalogue-Write':'1',
        Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')},body:JSON.stringify(body)
    });
    const report = await response.json();
    log(report.notice || 'Catalogue request returned HTTP '+response.status);
    for (const row of report.results || []) log([row.name,row.operation,row.reason].filter(Boolean).join('  '));
    if (report.counts) log(Object.entries(report.counts).map(([k,n])=>k+' '+n).join(', '));
    if (report.bundleFingerprint) log('Bundle SHA-256 '+report.bundleFingerprint);
    if (report.planFingerprint) log('Plan fingerprint '+report.planFingerprint);
    for (const issue of report.issues || []) log(issue);
    if (report.message) log(report.message);
    if (flags.report) await writeFile(flags.report,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    return response.ok && report.ok ? 0 : 1;
  } catch { return fail('File, network or report error. Run a fresh dry run to check the catalogue.'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2),process.env);
}
