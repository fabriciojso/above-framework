'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
const archives = fs.readdirSync(artifacts).filter((name) => name.endsWith('.tgz'));
if (archives.length !== 1) throw new Error('Expected exactly one verified package tarball');
const consumer = path.join(artifacts, 'ci-consumer');
fs.mkdirSync(consumer, { recursive: true });
fs.writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({
    name: 'above-ci-consumer',
    version: '1.0.0',
    private: true,
    dependencies: {
      'above-framework': 'file:' + path.join(artifacts, archives[0]),
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
delete env.ABOVE_TEST_FILTER;
for (const [command, args, cwd] of [
  ['npm', ['install', '--production', '--engine-strict', '--ignore-scripts', '--no-audit', '--no-fund'], consumer],
  [process.execPath, [path.join(root, 'test/integration.js')], root],
]) {
  const result = childProcess.spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
