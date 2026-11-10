'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const coverage = require('istanbul-lib-coverage');
const reports = require('istanbul-reports');
const report = require('istanbul-lib-report');
const root = path.resolve(__dirname, '..');
const temp = path.join(root, '.nyc_output');
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(temp, { recursive: true });
const child = childProcess.spawnSync(
  process.execPath,
  ['--require', path.join(__dirname, 'coverage-hook.js'), path.join(root, 'test/integration.js')],
  { stdio: 'inherit', env: Object.assign({}, process.env, { ABOVE_COVERAGE_DIR: temp }) },
);
const map = coverage.createCoverageMap({});
for (const file of fs.readdirSync(temp)) map.merge(JSON.parse(fs.readFileSync(path.join(temp, file), 'utf8')));
const context = report.createContext({ dir: path.join(root, 'coverage'), coverageMap: map });
for (const name of ['text', 'lcov', 'json', 'json-summary']) reports.create(name).execute(context);
let passed = child.status === 0 && map.files().length > 0;
const summary = map.getCoverageSummary().toJSON();
for (const metric of ['lines', 'branches', 'functions', 'statements']) {
  if (summary[metric].pct !== 100) {
    passed = false;
    console.error(metric + ' coverage is ' + summary[metric].pct + '%, required: 100%.');
  }
}
process.exitCode = passed ? 0 : 1;
