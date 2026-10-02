// The shared secret & danger rules (lib/secret-rules.mjs) — pure functions, no processes.
// Every secret-looking fixture is ASSEMBLED at runtime from fragments, so this file holds no
// contiguous literal for secret-scan (or the PreToolUse hook) to trip on.
//   node --test .github/hooks/secret-rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecret, findSecretInText, evaluateToolCall, isConfigFile, isSecretName, redact } from './lib/secret-rules.mjs';

const Q = '"';
const S = "'";
const PW = 'pass' + 'word';
const AK = 'api' + '_key';
const VAL = 'hunter2' + 'prod' + 'value';
const SK = 's' + 'k-' + 'abcdef1234567890' + 'abcdef';
const ENVJS = 'process' + '.env';
const ENVPY = 'os' + '.environ';
const RMRF = 'r' + 'm -rf build';
const FIND = 'fi' + 'nd';
const DEL = '-' + 'delete';

test('the env-fallback blind spot is closed: a line that reads an env var is still scanned', () => {
  const caught = [
    [`const apiKey = ${ENVJS}.OPENAI_API_KEY || ${Q}${SK}${Q};`, 'the reported bypass: env read with a literal fallback'],
    [`const apiKey = ${Q}${SK}${Q}; // TODO read from ${ENVJS}`, 'an env var named only in a comment'],
    [`DB_PASSWORD = ${ENVPY}.get(${Q}DB_PASSWORD${Q}, ${Q}${VAL}${Q})`, 'Python default'],
    [`const t = ${ENVJS}.GITHUB_TOKEN ?? ${S}${VAL}${S};`, 'JS nullish fallback'],
    [`const t = ${ENVJS}[${Q}JWT_SECRET${Q}] || ${Q}${VAL}${Q};`, 'JS bracket access'],
    [`'key' => env(${S}APP_SECRET${S}, ${S}${VAL}${S}),`, 'PHP env() default'],
    [`ENV.fetch(${Q}API_TOKEN${Q}, ${Q}${VAL}${Q})`, 'Ruby ENV.fetch default'],
    [`POSTGRES_PASSWORD: \${DB_PASSWORD:-${VAL}}`, 'shell / compose default'],
    [`${PW}: \${spring.datasource.${PW}:${VAL}}`, 'Spring default'],
  ];
  for (const [line, why] of caught) assert.ok(findSecret(line), `expected a finding — ${why}`);
});

test('credential forms that matched neither guard before 2.0.1', () => {
  assert.ok(findSecret(`{ ${Q}${PW}${Q}: ${Q}${VAL}${Q} }`), 'JSON key form');
  assert.ok(findSecret(`SECRET_KEY = ${S}django-insecure-${VAL}${S}`), 'Django SECRET_KEY');
  assert.ok(findSecret(`spring.datasource.${PW}=${VAL}`, { configFile: true }), 'unquoted value in a .properties file');
  assert.ok(findSecret(`${PW}: ${Q}your-${PW}${Q}, ${AK}: ${Q}${VAL}${Q}`), 'a placeholder early in the line must not hide a real value later');
});

test('current vendor key formats are recognised', () => {
  const keys = {
    'OpenAI project or service key': 's' + 'k-proj-' + 'Ab3dEf7hIj1lMn4pQr6tUv8w',
    'Anthropic API key': 's' + 'k-ant-api03-' + 'Ab3dEf7hIj1lMn4pQr6tUv8w',
    'GitHub fine-grained token': 'github' + '_pat_' + '11ABCDEFG0123456789abcdefghij',
    'Stripe live key': 's' + 'k_live_' + 'Ab3dEf7hIj1lMn4pQr6tUv8w',
    'private key block': '-----BEGIN ' + 'ENCRYPTED PRIVATE KEY-----',
    'OpenAI-style key': SK,
  };
  for (const [kind, key] of Object.entries(keys)) assert.equal(findSecret(`k = ${Q}${key}${Q}`)?.kind, kind);
});

test('no false positives on ordinary code', () => {
  const clean = [
    `const ${PW} = ${ENVJS}.DB_PASSWORD;`,
    `const k = ${ENVJS}.API_KEY || ${Q}your-api-key${Q};`,
    `const port = ${ENVJS}.PORT || ${Q}8080-local${Q};`,
    `const p = ${ENVJS}.PRIVATE_KEY_PATH || ${Q}./certs/key.pem${Q};`,
    `${AK} = ${Q}\${API_KEY}${Q}`,
    `\${DB_PASSWORD:-\${FALLBACK}}`,
    `if ${PW} == ${Q}${VAL}${Q}:`,
    `spring.datasource.${PW}=${VAL}`,
    `secretName: tls-cert-store`,
    'class=' + Q + 's' + 'k-loading-spinner-container-wrapper' + Q,
    `OPENAI_API_KEY=s${'k-EXAMPLE'}deadbeef0123456`,
  ];
  for (const line of clean) assert.equal(findSecret(line), null, `unexpected finding in: ${line}`);
  assert.equal(findSecret(`spring.datasource.${PW}=\${DB_PASSWORD}`, { configFile: true }), null);
});

test('helpers: secret names, config files, multi-line text, redaction', () => {
  assert.ok(isSecretName('OPENAI_API_KEY') && isSecretName('db.password'));
  assert.ok(!isSecretName('PRIVATE_KEY_PATH') && !isSecretName('PORT') && !isSecretName('AWS_ACCESS_KEY_ID'));
  assert.ok(isConfigFile('src/main/resources/application.properties') && !isConfigFile('app.yml'));
  assert.equal(findSecretInText(`a\nb\n${PW} = ${Q}${VAL}${Q}`)?.line, 3);
  assert.equal(redact(VAL), 'hunt***ue');
  assert.equal(redact('short'), '***');
});

const call = (input, name = 'Write') => evaluateToolCall(JSON.stringify({ tool_name: name, tool_input: input })).decision;

test('hook: each field is judged as itself, not as a JSON re-encoding of the whole call', () => {
  assert.equal(call({ path: 'app.py', file_text: `${PW} = ${Q}${VAL}${Q}` }), 'deny', 'the reported bypass: a double-quoted credential');
  assert.equal(call({ path: 'cfg.json', content: `{${Q}${AK}${Q}: ${Q}${VAL}${Q}}` }), 'deny', 'JSON key form');
  assert.equal(call({ path: 'cfg.yml', new_str: `${PW}: ${Q}${VAL}${Q}` }, 'Edit'), 'deny', 'YAML');
  assert.equal(call({ path: 'x.js', file_text: `${FIND} . -name x\nconsole.log(${Q}${DEL}${Q})` }), 'allow', 'two lines are not one command');
  assert.equal(call({ command: `${FIND} . -name x ${DEL}` }, 'Bash'), 'deny', 'one command line still is');
});

test('hook: commands, content, prose and removed text get the rules that fit them', () => {
  assert.equal(call({ command: RMRF, description: 'clean' }, 'Bash'), 'deny');
  assert.equal(call({ command: ['r' + 'm', '-rf', '/tmp/x'] }, 'Bash'), 'deny', 'an argv array is one command');
  assert.equal(call({ command: 'ls', description: `instead of ${RMRF}` }, 'Bash'), 'allow', 'prose describing a command is not a command');
  assert.equal(call({ path: 'docs/notes.md', file_text: `Never run ${RMRF} by hand.` }), 'allow', 'documentation may name a command');
  assert.equal(call({ path: 'scripts/clean.sh', file_text: RMRF }), 'deny', 'a script may not contain one');
  assert.equal(call({ path: 'README.md', file_text: `use ${Q}${SK}${Q}` }), 'deny', 'documentation may not contain a secret');
  assert.equal(call({ path: 'a.js', old_str: `${PW} = ${Q}${VAL}${Q}`, new_str: `${PW} = ${ENVJS}.DB_PASSWORD` }, 'Edit'), 'allow',
    'removing a secret must be possible: the old text is not written');
  assert.equal(call({ command: 'git ' + 'push --force-with-lease' }, 'Bash'), 'allow');
  assert.equal(call({ path: 'a.js' }, 'Read'), 'allow');
});

test('hook: patches and SEARCH/REPLACE edits are judged by what they add', () => {
  const removing = `*** Begin Patch\n*** Update File: a.py\n@@\n-${PW} = ${Q}${VAL}${Q}\n+${PW} = ${ENVPY}[${Q}DB_PASSWORD${Q}]\n*** End Patch`;
  const adding = `*** Begin Patch\n*** Add File: b.py\n+${PW} = ${Q}${VAL}${Q}\n*** End Patch`;
  const searchReplace = `<<<<<<< SEARCH\n${PW} = ${Q}${VAL}${Q}\n=======\n${PW} = ${ENVPY}[${Q}X${Q}]\n>>>>>>> REPLACE`;
  assert.equal(call({ input: removing }, 'apply_patch'), 'allow');
  assert.equal(call({ input: adding }, 'apply_patch'), 'deny');
  assert.equal(call({ path: 'c.py', diff: searchReplace }, 'replace_in_file'), 'allow');
});

test('hook: payload shapes from every harness, and a payload that is not JSON', () => {
  assert.equal(evaluateToolCall(JSON.stringify({ toolName: 'bash', toolArgs: { command: RMRF } })).decision, 'deny', 'camelCase preToolUse');
  assert.equal(evaluateToolCall(JSON.stringify({ toolName: 'bash', toolArgs: JSON.stringify({ command: RMRF }) })).decision, 'deny', 'args as a JSON string');
  assert.equal(evaluateToolCall(`not json ${RMRF}`).decision, 'deny', 'unparseable is scanned raw — it used to be allowed');
  assert.equal(evaluateToolCall('not json at all').decision, 'allow');
  assert.equal(evaluateToolCall('').decision, 'allow');
  const v = evaluateToolCall(JSON.stringify({ tool_name: 'Write', tool_input: { path: 'a.py', file_text: `${PW} = ${Q}${VAL}${Q}` } }));
  assert.match(v.reason, /hardcoded credential/);
  assert.doesNotMatch(v.reason, new RegExp(VAL), 'a denial must not echo the secret');
});
