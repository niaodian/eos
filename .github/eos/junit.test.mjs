// JUnit XML parsing and trace-matrix matching (ADR-016) — pure functions, no sandbox.
//
// The node:test and pytest fixtures are real reporter output (Node 22 and 24, pytest 9), trimmed of
// host names and stack traces; the others are the shapes vitest, Playwright, Maven Surefire, gotestsum
// and JunitXml.TestLogger write. A parser that only ever saw hand-written XML would be tested
// against the reports nobody produces.
//   node --test .github/eos/junit.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseJUnit, answerReference, nameMatches, locationVerdict, JUNIT_MAX_BYTES } from './lib/junit.mjs';
import { globToRegExp, deriveResults, producerFromEnv, findReports, readReports } from './lib/test-evidence.mjs';
import { sourceTokens, declaresSelector, TEST_PATH } from './lib/test-source.mjs';
import { parseTraceMatrix } from './lib/gate-primitives.mjs';

const temps = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const NODE = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="valid password logs the user in" time="0.000349" classname="test"/>
	<testsuite name="session" time="0.001603" disabled="0" errors="0" tests="4" failures="1" skipped="1">
		<testcase name="expires after 30 minutes" time="0.000149" classname="test"/>
		<testcase name="is skipped" time="0.000079" classname="test">
			<skipped type="skipped" message="not yet"/>
		</testcase>
		<testcase name="fails" time="0.000463" classname="test" failure="Expected values to be strictly equal:1 !== 2">
			<failure type="testCodeFailure" message="Expected values to be strictly equal:1 !== 2">
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:
    at TestContext.&lt;anonymous> (file:///work/tests/login.test.mjs:8:32)
			</failure>
		</testcase>
		<testsuite name="nested" time="0.000102" disabled="0" errors="0" tests="1" failures="0" skipped="0">
			<testcase name="deep case" time="0.000051" classname="test"/>
		</testsuite>
	</testsuite>
	<testcase name="todo case" time="0.000233" classname="test">
		<skipped type="todo" message="true"/>
	</testcase>
	<!-- tests 6 -->
</testsuites>
`;

const PYTEST = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="0" failures="1" skipped="1" tests="5" time="0.016"><testcase classname="pytests.test_login" name="test_valid_password" time="0.000" /><testcase classname="pytests.test_login.TestSession" name="test_expires" time="0.000" /><testcase classname="pytests.test_login" name="test_param[1]" time="0.000" /><testcase classname="pytests.test_login" name="test_param[2]" time="0.000"><failure message="assert 2 == 1">n = 2\n\n&gt;       assert n == 1\nE       assert 2 == 1</failure></testcase><testcase classname="pytests.test_login" name="test_skipped" time="0.000"><skipped type="pytest.skip" message="later">pytests/test_login.py:14: later</skipped></testcase></testsuite></testsuites>';

// node:test from Node 24.11 on (nodejs/node#59432): each testcase carries the absolute path of its file.
const NODE24 = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="valid password logs the user in" time="0.000296" classname="test" file="/work/app/tests/login.test.mjs"/>
	<testsuite name="session" time="0.000221" disabled="0" errors="0" tests="2" failures="0" skipped="1">
		<testcase name="expires after 30 minutes" time="0.000070" classname="test" file="/work/app/tests/login.test.mjs"/>
		<testcase name="is skipped" time="0.000040" classname="test" file="/work/app/tests/login.test.mjs">
			<skipped type="skipped" message="not yet"/>
		</testcase>
	</testsuite>
	<!-- tests 3 -->
</testsuites>
`;

const PYTEST_XUNIT1 = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" tests="1"><testcase classname="pytests.test_login" name="test_valid_password" file="pytests/test_login.py" line="2" time="0.000" /></testsuite></testsuites>';

const VITEST = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="2" failures="0" errors="0" time="0.01">
    <testsuite name="src/login.test.ts" timestamp="2026-10-03T00:00:00.000Z" tests="2" failures="0" errors="0" skipped="0" time="0.004">
        <testcase classname="src/login.test.ts" name="login &gt; valid password" time="0.001"></testcase>
        <testcase classname="src/login.test.ts" name="login &gt; rejects a wrong password" time="0.001"></testcase>
    </testsuite>
</testsuites>`;

const PLAYWRIGHT = `<testsuites id="" name="" tests="1" failures="0" skipped="0" errors="0" time="1.2">
<testsuite name="login.spec.ts" timestamp="2026-10-03T00:00:00.000Z" hostname="chromium" tests="1" failures="0" skipped="0" time="1.1" errors="0">
<testcase name="login › signs in" classname="login.spec.ts" time="1.1"></testcase>
</testsuite>
</testsuites>`;

const SUREFIRE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="3.0" name="com.example.LoginTest" time="0.05" tests="2" errors="0" skipped="0" failures="1">
  <properties><property name="java.version" value="21"/></properties>
  <testcase name="validPassword" classname="com.example.LoginTest" time="0.01"/>
  <testcase name="wrongPassword" classname="com.example.LoginTest" time="0.01">
    <failure message="expected: &lt;true&gt;" type="org.opentest4j.AssertionFailedError"><![CDATA[expected: <true> but was: <false>]]></failure>
    <system-out><![CDATA[log line with & and < in it]]></system-out>
  </testcase>
</testsuite>`;

const GOTESTSUM = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="0" errors="0" time="0.3">
	<testsuite tests="1" failures="0" time="0.01" name="github.com/acme/app/auth" timestamp="2026-10-03T00:00:00Z">
		<properties><property name="go.version" value="go1.22.0"></property></properties>
		<testcase classname="github.com/acme/app/auth" name="TestValidPassword" time="0.00"></testcase>
	</testsuite>
</testsuites>`;

const DOTNET = '<testsuites><testsuite name="MyApp.Tests.dll" tests="1"><testcase classname="MyApp.Tests.LoginTests" name="ValidPassword" time="0.01" /></testsuite></testsuites>';

const cases = (xml, report = 'reports/junit/r.xml') => {
  const r = parseJUnit(xml);
  assert.ok(r.ok, r.error);
  return r.cases.map((c) => ({ ...c, report }));
};

test('node:test output: nested suites, skips, todos and failures are read with their outcome', () => {
  const got = cases(NODE).map((c) => `${c.status} ${c.suites.join(' > ') || '-'} :: ${c.name}`);
  assert.deepEqual(got, [
    'PASS - :: valid password logs the user in',
    'PASS session :: expires after 30 minutes',
    'SKIP session :: is skipped',
    'FAIL session :: fails',
    'PASS session > nested :: deep case',
    'SKIP - :: todo case',
  ]);
});

test('a report that records no file is matched by name, and says so', () => {
  const a = answerReference(cases(NODE), 'tests/login.test.mjs', 'valid password logs the user in');
  assert.deepEqual([a.status, a.match], ['PASS', 'name']);
  assert.match(a.detail, /matched by name/);
  // A selector may carry the describe path, in the separator the matrix already uses.
  assert.equal(answerReference(cases(NODE), 'tests/login.test.mjs', 'session > nested > deep case').status, 'PASS');
});

test('node:test from Node 24.11 records each case\'s file: matched by file, and a case in another file does not answer the row', () => {
  const a = answerReference(cases(NODE24), 'tests/login.test.mjs', 'session > expires after 30 minutes');
  assert.deepEqual([a.status, a.match], ['PASS', 'file']);
  assert.equal(answerReference(cases(NODE24), 'tests/login.test.mjs', 'is skipped').status, 'SKIP');
  const elsewhere = answerReference(cases(NODE24), 'tests/logout.test.mjs', 'valid password logs the user in');
  assert.equal(elsewhere.status, 'ERROR');
  assert.match(elsewhere.detail, /places it in \/work\/app\/tests\/login\.test\.mjs, not tests\/logout\.test\.mjs/);
});

test('read from a repository, a report\'s absolute file paths become repository paths — the checkout is never recorded', () => {
  const root = mkdtempSync(join(tmpdir(), 'eos-junit-'));
  temps.push(root);
  mkdirSync(join(root, 'reports'));
  const real = realpathSync.native(root);
  const attr = (p) => p.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  writeFileSync(join(root, 'reports/r.xml'), [
    '<testsuites>',
    `<testcase name="a" classname="test" file="${attr(join(root, 'tests', 'a.test.mjs'))}"/>`,
    `<testcase name="b" classname="test" file="${attr(join(real, 'tests', 'b.test.mjs'))}"/>`,
    `<testcase name="c" classname="test" file="${attr(join(dirname(root), 'elsewhere', 'c.test.mjs'))}"/>`,
    '<testcase name="d" classname="test" file="tests/d.test.mjs"/>',
    '</testsuites>',
  ].join('\n'));
  const { cases: read, error } = readReports(root, ['reports/r.xml']);
  assert.equal(error, null);
  assert.deepEqual(read.map((c) => c.file), ['tests/a.test.mjs', 'tests/b.test.mjs', join(dirname(root), 'elsewhere', 'c.test.mjs'), 'tests/d.test.mjs']);
  // A path outside the repository is still placed by its end, as before.
  assert.equal(locationVerdict(read[2], 'elsewhere/c.test.mjs'), 'agrees');
});

test('a skipped or todo test is never a PASS, and a failing one fails the row', () => {
  assert.equal(answerReference(cases(NODE), 'tests/login.test.mjs', 'is skipped').status, 'SKIP');
  assert.equal(answerReference(cases(NODE), 'tests/login.test.mjs', 'todo case').status, 'SKIP');
  assert.equal(answerReference(cases(NODE), 'tests/login.test.mjs', 'fails').status, 'FAIL');
});

test('one failing instance of a same-named test fails the row (parametrised pytest)', () => {
  const a = answerReference(cases(PYTEST), 'pytests/test_login.py', 'test_param');
  assert.equal(a.status, 'FAIL');
  assert.match(a.detail, /2 testcase\(s\).*1 FAIL/);
});

test('pytest locates a case by its module; a case placed elsewhere does not answer the row', () => {
  const ok = answerReference(cases(PYTEST), 'pytests/test_login.py', 'TestSession::test_expires');
  assert.deepEqual([ok.status, ok.match], ['PASS', 'file']);
  const wrongFile = answerReference(cases(PYTEST), 'other/test_x.py', 'test_valid_password');
  assert.equal(wrongFile.status, 'ERROR');
  assert.match(wrongFile.detail, /places it in pytests\.test_login, not other\/test_x\.py/);
  assert.equal(answerReference(cases(PYTEST_XUNIT1), 'pytests/test_login.py', 'test_valid_password').match, 'file');
});

test('a name is never matched as a substring', () => {
  const tc = { name: 'invalid password', classname: 'test', suites: [], file: null };
  assert.equal(nameMatches(tc, 'valid password'), false);
  assert.equal(nameMatches(tc, 'password'), false);
  const missing = answerReference(cases(NODE), 'tests/login.test.mjs', 'password');
  assert.equal(missing.status, 'ERROR');
  assert.match(missing.detail, /no testcase named "password"/);
});

test('vitest, Playwright, Surefire, gotestsum and .NET reports place their cases in the right file', () => {
  assert.deepEqual(['status', 'match'].map((k) => answerReference(cases(VITEST), 'src/login.test.ts', 'valid password')[k]), ['PASS', 'file']);
  assert.equal(answerReference(cases(PLAYWRIGHT), 'tests/e2e/login.spec.ts', 'signs in').match, 'file');
  assert.equal(answerReference(cases(SUREFIRE), 'src/test/java/com/example/LoginTest.java', 'validPassword').status, 'PASS');
  assert.equal(answerReference(cases(SUREFIRE), 'src/test/java/com/example/LoginTest.java', 'LoginTest#wrongPassword').status, 'FAIL');
  assert.equal(answerReference(cases(GOTESTSUM), 'auth/login_test.go', 'TestValidPassword').match, 'file');
  assert.equal(answerReference(cases(DOTNET), 'tests/MyApp.Tests/LoginTests.cs', 'ValidPassword').match, 'file');
  assert.equal(locationVerdict(cases(DOTNET)[0], 'tests/AuthTests.cs'), 'contradicts');
});

test('a row that names only a file needs a report that records files', () => {
  const located = answerReference(cases(PYTEST), 'pytests/test_login.py', '');
  assert.equal(located.status, 'FAIL', 'all five cases in the module count, and one of them fails');
  const unlocated = answerReference(cases(NODE), 'tests/login.test.mjs', '');
  assert.equal(unlocated.status, 'ERROR');
  assert.match(unlocated.detail, /do not record which file/);
});

test('DOCTYPE and ENTITY declarations are refused — entity expansion has nothing to expand', () => {
  const laughs = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><testsuites><testcase name="&lol2;"/></testsuites>';
  const r = parseJUnit(laughs);
  assert.equal(r.ok, false);
  assert.match(r.error, /DOCTYPE and ENTITY declarations are refused/);
  assert.match(parseJUnit('<testsuites><testcase name="&lol;"/></testsuites>').error, /not a legal reference/);
});

test('anything the parser cannot read with certainty is an error, never an empty pass', () => {
  for (const [xml, reason] of [
    ['', /no root element/],
    ['<results><testcase name="a"/></results>', /not a JUnit report/],
    ['<testsuites><testcase name="a"></testsuites>', /does not close/],
    ['<testsuites><x><testcase name="a"/></x></testsuites>', /inside <x>/],
    ['<testsuites><testcase/></testsuites>', /has no name/],
    ['<testsuites a="1" a="2"/>', /duplicate attribute/],
    ['<testsuites/><testsuites/>', /after the root element/],
    ['<testsuites><testcase name="a">&#0;</testcase></testsuites>', /not a legal entity/],
    [`${'<testsuite>'.repeat(70)}`, /nested deeper/],
  ]) {
    const r = parseJUnit(xml);
    assert.equal(r.ok, false, `${xml.slice(0, 40)} must not parse`);
    assert.match(r.error, reason);
  }
  assert.match(parseJUnit(`<testsuites>${' '.repeat(JUNIT_MAX_BYTES)}</testsuites>`).error, /refused rather than read/);
});

test('report globs: * stays in a segment, ** crosses them', () => {
  const re = globToRegExp('reports/**/*.xml');
  assert.ok(re.test('reports/node.xml'));
  assert.ok(re.test('reports/junit/py/x.xml'));
  assert.ok(!re.test('reportsx/node.xml'));
  assert.ok(!globToRegExp('reports/junit/*.xml').test('reports/junit/sub/x.xml'));
  assert.ok(globToRegExp('target/surefire-reports/TEST-*.xml').test('target/surefire-reports/TEST-com.example.LoginTest.xml'));
});

test('every reference of every trace-matrix row is answered, worst result kept per reference', () => {
  const rows = new Map([
    ['AC1.1', { testRefs: ['tests/login.test.mjs::valid password logs the user in'] }],
    ['AC1.2', { testRefs: ['tests/login.test.mjs::fails', 'pytests/test_login.py::test_valid_password'] }],
  ]);
  const results = deriveResults(rows, [...cases(NODE, 'reports/junit/node.xml'), ...cases(PYTEST, 'reports/junit/py.xml')]);
  assert.deepEqual(results.map((r) => `${r.ac} ${r.status} ${r.match}`), ['AC1.1 PASS name', 'AC1.2 FAIL name', 'AC1.2 PASS file']);
});

test('the producer says where the run happened, and claims nothing it cannot', () => {
  assert.deepEqual(producerFromEnv({}, 'eos verified gate'), { type: 'local', name: 'eos verified gate' });
  assert.deepEqual(producerFromEnv({ CI: 'false' }, 'x').type, 'local');
  assert.deepEqual(producerFromEnv({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app', GITHUB_RUN_ID: '42' }, 'x'),
    { type: 'ci', name: 'github-actions', runRef: 'https://github.com/acme/app/actions/runs/42' });
  assert.equal(producerFromEnv({ CI: 'true' }, 'x').name, 'ci');
});

test('a test is declared by a literal or a function name — never by a comment, and never inside a longer name', () => {
  const js = sourceTokens([
    "import { test, describe } from 'node:test';",
    "test('invalid password', () => {});",
    "// test('valid password', () => {});",
    "/* test('commented block', () => {}); */",
    "describe('session', () => { test(\"expires after 30 minutes\", () => {}); });",
    "test('it\\'s escaped', () => {});",
    "const re = /'not a string/; test('after a regex', () => {});",
    "test.each([[1, 2]])('adds %i + %i', (a, b) => {});",
    'test(`templated ${name}`, () => {});',
    '',
  ].join('\n'), 'mjs');
  assert.equal(declaresSelector(js, 'valid password'), false, 'a substring of "invalid password" is not a declaration');
  assert.equal(declaresSelector(js, 'invalid password'), true);
  assert.equal(declaresSelector(js, 'commented block'), false);
  assert.equal(declaresSelector(js, 'session > expires after 30 minutes'), true, 'a qualified selector: every part declared');
  assert.equal(declaresSelector(js, 'billing > expires after 30 minutes'), false);
  assert.equal(declaresSelector(js, "it's escaped"), true);
  assert.equal(declaresSelector(js, 'after a regex'), true, 'a quote inside a regex literal does not open a string');
  assert.equal(declaresSelector(js, 'adds 1 + 2'), true, 'a parametrised name template declares its instances');
  assert.equal(declaresSelector(js, 'adds 1 + 2', { strict: true }), false, 'but not when ruling out a second declaration');
  assert.equal(declaresSelector(js, 'templated login'), true);

  const py = sourceTokens([
    '# def test_commented(): pass',
    'class TestSession:',
    '    def test_expires(self):',
    "        '''test_in_docstring is text, not a function'''",
    '        assert True',
    'def helper(): test_called_only()',
    '',
  ].join('\n'), 'py');
  assert.equal(declaresSelector(py, 'test_commented'), false);
  assert.equal(declaresSelector(py, 'TestSession::test_expires'), true);
  assert.equal(declaresSelector(py, 'test_expires[1]'), true, 'a parameter suffix is not part of the declared name');
  assert.equal(declaresSelector(py, 'test_in_docstring', { strict: true }), false);
  assert.equal(declaresSelector(py, 'test_called_only', { strict: true }), false, 'a call is not a declaration');
  assert.equal(declaresSelector(sourceTokens('func TestLogin(t *testing.T) {}\n', 'go'), 'TestLogin', { strict: true }), true);
  assert.ok(TEST_PATH.test('tests/login.test.mjs') && TEST_PATH.test('pkg/auth/login_test.go') && TEST_PATH.test('src/LoginTests.cs'));
  assert.ok(!TEST_PATH.test('src/login.mjs'));
});

test('a trace matrix with a Test column is read from that column; prose that looks like a file name is dropped', () => {
  const rows = parseTraceMatrix([
    '| AC | Statement | Test | Result |', '| --- | --- | --- | --- |',
    '| AC1.1 | user logs in with SSO (e.g. Okta, via settings.yaml) | tests/login.test.mjs::valid password | PASS |',
    '', 'Another table without a test header:', '',
    '| AC | Covered by |', '| --- | --- |',
    '| AC1.2 | tests/logout.test.mjs::logs out (see Node.js docs) |',
  ].join('\n'));
  assert.deepEqual(rows.get('AC1.1').testColumnRefs, ['tests/login.test.mjs::valid password']);
  assert.deepEqual(rows.get('AC1.1').testRefs, ['e.g', 'settings.yaml', 'tests/login.test.mjs::valid password'], 'the gate still sees every cell');
  assert.equal(rows.get('AC1.2').testColumnRefs, undefined);

  const cases = parseJUnit('<testsuites><testcase name="valid password" classname="test"/><testcase name="logs out" classname="test"/></testsuites>').cases.map((c) => ({ ...c, report: 'r.xml' }));
  const exists = (rel) => ['tests/login.test.mjs', 'tests/logout.test.mjs'].includes(rel);
  const prose = new Map([['AC1.2', { testRefs: ['tests/logout.test.mjs::logs out', 'Node.js'] }]]);
  assert.deepEqual(deriveResults(new Map([...rows].filter(([ac]) => ac === 'AC1.1')), cases, { exists }).map((r) => `${r.ac} ${r.testPath} ${r.status}`),
    ['AC1.1 tests/login.test.mjs PASS'], 'only the Test column is read');
  assert.deepEqual(deriveResults(prose, cases, { exists }).map((r) => `${r.ac} ${r.testPath} ${r.status}`),
    ['AC1.2 tests/logout.test.mjs PASS'], '"Node.js" names no file, so it is prose');
  const onlyProse = new Map([['AC1.3', { testRefs: ['e.g'] }]]);
  assert.deepEqual(deriveResults(onlyProse, cases, { exists }).map((r) => `${r.testPath} ${r.status}`), ['e.g ERROR'], 'a row with nothing else keeps it, so its ERROR explains');
});

test('report discovery follows the pattern: a root file reads one directory, and per-class reports are not capped by count', () => {
  const root = mkdtempSync(join(tmpdir(), 'eos-junit-find-'));
  temps.push(root);
  mkdirSync(join(root, 'deep/a/b'), { recursive: true });
  for (let i = 0; i < 30; i += 1) writeFileSync(join(root, 'deep/a/b', `f${i}.xml`), '<testsuites/>');
  writeFileSync(join(root, 'junit.xml'), '<testsuites/>');
  writeFileSync(join(root, 'deep/junit.xml'), '<testsuites/>');
  assert.deepEqual(findReports(root, ['junit.xml'], { maxScanned: 5 }), { files: ['junit.xml'], error: null }, 'nothing below the root is read');
  assert.match(findReports(root, ['**/*.xml'], { maxScanned: 5 }).error, /more than 5 files/);
  assert.deepEqual(findReports(root, ['**/junit.xml']).files, ['deep/junit.xml', 'junit.xml']);
  assert.deepEqual(findReports(root, ['deep/*/b/f1.xml']).files, ['deep/a/b/f1.xml']);
  assert.equal(findReports(root, ['deep/**']).files.length, 31);

  mkdirSync(join(root, 'target/surefire-reports'), { recursive: true });
  for (let i = 0; i < 600; i += 1) writeFileSync(join(root, 'target/surefire-reports', `TEST-com.example.C${i}.xml`), '<testsuites/>');
  const surefire = findReports(root, ['target/surefire-reports/TEST-*.xml']);
  assert.equal(surefire.error, null);
  assert.equal(surefire.files.length, 600, 'one report per test class is how Surefire works');
});
