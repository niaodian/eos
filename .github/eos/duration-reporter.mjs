// A node:test reporter that records how long each test FILE took — nothing else.
//
// The layer runner already knew how long a layer took, but a layer is five files running in
// parallel, so "audit-regression got slower" said nothing about where. Node's built-in reporters
// print every individual test; this one collapses them to one number per file, which is the unit a
// person can actually act on ("this file doubled") and the unit a budget can be attached to.
//
// Per file it sums the durations of the TOP-LEVEL tests (nesting 0). Tests inside one file run
// sequentially by default, so that sum is the file's own time, independent of how many other files
// were running beside it — which is exactly what makes it comparable between runs.
//
// Used by run-tests.mjs as a second reporter, writing JSON to a temporary file while the normal
// spec/tap output still goes to the terminal.
export default async function* durationReporter(source) {
  const files = {};
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data?.nesting !== 0) continue;
    const key = event.data.file || '(unknown)';
    if (!files[key]) files[key] = { ms: 0, tests: 0, failed: 0 };
    files[key].ms += Math.round(event.data.details?.duration_ms || 0);
    files[key].tests += 1;
    if (event.type === 'test:fail') files[key].failed += 1;
  }
  yield `${JSON.stringify(files)}\n`;
}
