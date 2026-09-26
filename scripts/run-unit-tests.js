'use strict';
// Cross-platform test runner.
//
// `node --test tests/unit/*.test.js tests/integration/*.test.js` relied on
// shell glob expansion, which works on POSIX shells (bash/sh) but not on
// Windows' default `cmd.exe` (used by `npm run` on Windows), where the
// literal, unexpanded glob string is passed straight to Node and no files
// match it. This wrapper expands the same two directories itself (in a
// deterministic, sorted order) and invokes the built-in Node test runner
// directly, so `npm test` behaves identically on Linux, macOS, and Windows.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const dirs = ['tests/unit', 'tests/integration'];

function collectTestFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join(relativeDir, name));
}

const files = dirs.flatMap(collectTestFiles);
if (files.length === 0) {
  console.error('NO_TEST_FILES_FOUND: expected *.test.js files under ' + dirs.join(', '));
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
