'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const pack = require('./pack');
const root = path.resolve(__dirname, '..');
const tarball = pack();
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'above-consumer-'));
fs.writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({
    name: 'above-consumer-test',
    version: '1.0.0',
    private: true,
    dependencies: {
      'above-framework': 'file:' + tarball,
      '@hapi/joi': '15.1.1',
      joi: '17.13.9',
      '@types/hapi__joi': '15.0.3',
    },
  }),
);
function run(command, args, options) {
  const result = childProcess.spawnSync(command, args, Object.assign({ stdio: 'inherit' }, options));
  if (result.status !== 0) throw new Error(command + ' exited with status ' + result.status);
}
run('npm', ['install', '--omit=dev', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: consumer,
});
const env = Object.assign({}, process.env, {
  ABOVE_PACKAGE_ROOT: path.join(consumer, 'node_modules/above-framework'),
  ABOVE_CONSUMER_ROOT: consumer,
});
delete env.ABOVE_TEST_FILTER;
run(process.execPath, [path.join(root, 'test/integration.js')], { env });
run(process.execPath, [path.join(root, 'scripts/test-types.js')], { env });
run(
  'npm',
  ['install', '--save-exact', '@types/node@12.20.55', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: consumer },
);
run(process.execPath, [path.join(root, 'scripts/test-types.js')], {
  env: Object.assign({}, env, { ABOVE_TYPESCRIPT_LEGACY: '1' }),
});
console.log('Clean production-only installation and consumer tests passed.');
