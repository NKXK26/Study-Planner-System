const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const XLSX = require('xlsx');

const root = resolve(__dirname, '..');
const pagePath = resolve(root, 'src/app/view/compare_study_planner/page.jsx');
const { outputText } = ts.transpileModule(readFileSync(pagePath, 'utf8'), {
  fileName: pagePath,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
});

const code = 'COS10003';
const catalogue = [{
  id: 1,
  name: '25-Mar-CSCS',
  units: [{ UnitCode: code, Name: 'Test unit', CreditPoints: 12.5, unitType: { ID: 2, Name: 'Core' } }],
}];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
  { Course: code, 'Course Title': 'Test unit', Grade: 'P', Status: 'Complete', Credits: 12.5, Term: '2025_MAR_S1' },
]), 'Transcript');
const transcript = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

function findElement(element, predicate) {
  if (!React.isValidElement(element)) return undefined;
  if (predicate(element)) return element;
  return React.Children.toArray(element.props.children)
    .map(child => findElement(child, predicate)).find(Boolean);
}

async function testUpload(warning) {
  // Keep parent state across the simulated file change, then use React to render
  // the resulting tree, including the real InlineStudyPlanner and its hooks.
  const state = [];
  let cursor = 0;
  let evaluatingParent = false;
  const hooks = {
    ...React,
    useState(initialValue) {
      if (!evaluatingParent) return React.useState(initialValue);
      const index = cursor++;
      if (!(index in state)) state[index] = initialValue;
      return [state[index], value => { state[index] = value; }];
    },
    useEffect(...args) { if (!evaluatingParent) React.useEffect(...args); },
    useRef(initialValue) { return evaluatingParent ? { current: initialValue } : React.useRef(initialValue); },
  };
  const passThrough = ({ children }) => children;
  const imports = {
    react: hooks,
    '@components/helper': { ConditionalRequireAuth: passThrough },
    '@app/context/RoleContext': { useRole: () => ({ can: () => true, isSuperadmin: () => false }) },
    '@components/PageLoadingWrapper': passThrough,
    '@components/AccessDenied': () => null,
    '@/app/view/unit_suggestion/ReplacementWorkspace': () => null,
    '@/app/view/unit_suggestion/UnitPoolToolbox': () => null,
    '@/app/view/unit_suggestion/Exportstudyplannerpdf': {},
    '@/app/view/unit_suggestion/SuggestionUIComponents': {},
    '@utils/auth/FrontendAuthHelper': {
      async authenticatedFetch(url, options) {
        assert.equal(url, '/api/official-planners');
        assert.equal(options.cache, 'no-store');
        return { ok: true, json: async () => ({ success: true, data: catalogue, warning }) };
      },
    },
  };
  const page = { exports: {} };
  const load = id => {
    if (id in imports) return imports[id];
    if (id.startsWith('@/')) return require(resolve(root, 'src', id.slice(2)));
    if (id.startsWith('@app/')) return require(resolve(root, 'src/app', id.slice(5)));
    return require(id);
  };
  class TranscriptReader {
    readAsArrayBuffer() { this.onload({ target: { result: transcript } }); }
  }
  new Function('require', 'module', 'exports', 'FileReader', outputText)(load, page, page.exports, TranscriptReader);

  const evaluatePage = () => {
    cursor = 0;
    evaluatingParent = true;
    try { return page.exports.default(); }
    finally { evaluatingParent = false; }
  };
  const upload = findElement(evaluatePage(), element => element.type === 'input' && element.props.type === 'file');
  await upload.props.onChange({ target: { files: [{ name: 'transcript.xlsx' }] } });
  const result = evaluatePage();
  const html = renderToStaticMarkup(result);
  assert.match(html, /Study Planner Recommendation/);
  if (warning) {
    assert.match(html, /<p role="status"[^>]*>Catalogue is using a cached revision\.<\/p>/);
  } else {
    assert.doesNotMatch(html, /<p role="status"/);
    const planner = findElement(result, element => element.type?.name === 'InlineStudyPlanner');
    const { catalogueWarning, ...props } = planner.props;
    assert.match(renderToStaticMarkup(React.createElement(planner.type, props)), /Study Planner Recommendation/);
  }
}

(async () => {
  await testUpload();
  await testUpload('Catalogue is using a cached revision.');
  console.log('Transcript upload renders the inline planner with or without a catalogue warning.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
