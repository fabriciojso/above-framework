'use strict';
// Runs in the Linux verification container on the development Node, then invokes the target Node.
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected an exact Node version');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.artifacts/runtimes/node-v' + version + '-linux-x64');
const node = path.join(runtime, 'bin/node');
const consumer = path.join(root, '.artifacts/consumers', version);
fs.rmSync(consumer, { recursive: true, force: true });
fs.mkdirSync(consumer, { recursive: true });
const tarball = path.join(root, '.artifacts', path.basename(process.env.ABOVE_TARBALL));
fs.writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({
    name: 'above-node-' + version.replace(/\./g, '-'),
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
const env = Object.assign({}, process.env, {
  ABOVE_PACKAGE_ROOT: path.join(consumer, 'node_modules/above-framework'),
  ABOVE_CONSUMER_ROOT: consumer,
});
delete env.NODE_OPTIONS;
delete env.ABOVE_TEST_FILTER;
function run(args, cwd) {
  const result = childProcess.spawnSync(node, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Node ' + version + ' exited with status ' + result.status);
}
run(
  [
    path.join(runtime, 'lib/node_modules/npm/bin/npm-cli.js'),
    'install',
    '--production',
    '--engine-strict',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ],
  consumer,
);
run([path.join(root, 'test/integration.js')], root);
console.log('Node ' + version + ': production installation and integration passed.');
