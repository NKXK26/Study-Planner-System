// Reproducible FYP evidence runner. Reports suites and executed assertions separately.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const integration = process.argv.includes('--integration');
const files = integration ? ['test-planner-tools.cjs'] : fs.readdirSync(__dirname)
  .filter(file => /^test-.*\.cjs$/.test(file) && !['test-new-modules.cjs','test-planner-tools.cjs'].includes(file)).sort();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(root, 'docs', 'testing', 'runs', stamp + (integration ? '-integration' : '-regression'));
fs.mkdirSync(directory, {recursive: true});
const env = {...process.env};
if (integration) env.FYP_TEST_TEMP_ROOT = path.join(root,'tmp','test-temp');
delete env.CHAT_TEST_URL; // Optional external HTTP checks are not claimed in offline runs.
const results = [];
for (const file of files) {
  const started = Date.now();
  const assertionFile = path.join(directory, file + '.assertions.json');
  const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'testing/count-assertions.cjs'), path.join(__dirname, file)], {
    cwd: root, env: {...env, FYP_ASSERTION_SUITE: path.join(__dirname,file), FYP_ASSERTION_OUTPUT: assertionFile}, encoding: 'utf8', windowsHide: true,
    timeout: integration ? 300000 : 60000, maxBuffer: 8 * 1024 * 1024,
  });
  const assertions = fs.existsSync(assertionFile) ? JSON.parse(fs.readFileSync(assertionFile,'utf8')) : null;
  const passed = result.status === 0 && !result.error && assertions?.pending === 0 && assertions?.failed === 0;
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '');
  fs.writeFileSync(path.join(directory, file + '.log'), output);
  results.push({suite: file, status: passed ? 'PASS' : 'FAIL', assertions, seconds: Number(((Date.now()-started)/1000).toFixed(2)), exitCode: result.status, signal: result.signal});
  console.log(`${passed ? 'PASS' : 'FAIL'} ${file} (${assertions?.executed ?? 'unknown'} assertions)`);
}
const report = {
  executedAt: new Date().toISOString(), commit: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  workingTree: execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim(),
  node: process.version, platform: process.platform, arch: process.arch,
  mode: integration ? 'Built HTTP APIs, disposable database, mock LLM' : 'Offline unit and regression suites; external HTTP checks disabled',
  passed: results.filter(r=>r.status==='PASS').length, failed: results.filter(r=>r.status==='FAIL').length, results,
  assertions: results.reduce((a,r)=>{for(const key of ['executed','passed','failed','pending'])a[key]+=r.assertions?.[key]||0;return a;},{executed:0,passed:0,failed:0,pending:0}),
};
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(directory,'results.csv'),'Suite,Status,Assertions,Seconds,Exit code\n'+results.map(r=>`${r.suite},${r.status},${r.assertions?.executed??''},${r.seconds},${r.exitCode}`).join('\n')+'\n');
fs.writeFileSync(path.join(directory,'summary.md'),`# Automated test execution\n\nExecuted: ${report.executedAt}\n\nCommit: ${report.commit}\n\nEnvironment: Node ${report.node}, ${report.platform}/${report.arch}\n\nMode: ${report.mode}\n\n**${report.passed} suites passed; ${report.failed} failed.** These are suite counts, not individual test-case counts.\n\n| Suite | Result | Seconds |\n| --- | --- | --- |\n`+results.map(r=>`| ${r.suite} | ${r.status} | ${r.seconds} |`).join('\n')+'\n\nSee results.json for working-tree state and individual logs for assertions and errors. This run does not establish lecturer acceptance, real-model accuracy, browser usability, or performance.\n');
console.log(`Evidence: ${path.relative(root,directory)}`);
const detail=`\nExecuted assertion calls: ${report.assertions.executed}; passed: ${report.assertions.passed}; failed: ${report.assertions.failed}; pending: ${report.assertions.pending}.\n\nAssertions include repeated checks in loops and setup assertions. They are not independent test cases, unique scenarios, functions covered, or a coverage percentage. Counts include only direct node:assert/strict calls from each suite.\n`;
fs.appendFileSync(path.join(directory,'summary.md'),detail);
console.log(`SUITES: ${report.passed} passed | ${report.failed} failed | ${results.length} total`);
console.log(`ASSERTIONS: ${report.assertions.passed} passed | ${report.assertions.failed} failed | ${report.assertions.pending} pending | ${report.assertions.executed} executed`);
console.log('Counts are assertion executions, not independent test cases or code coverage.');
process.exitCode = report.failed ? 1 : 0;
