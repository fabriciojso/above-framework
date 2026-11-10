'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const root = path.resolve(__dirname, '..');
const packageRoot = path.resolve(process.env.ABOVE_PACKAGE_ROOT || root);
const legacy = process.env.ABOVE_TYPESCRIPT_LEGACY === '1';
const work = process.env.ABOVE_CONSUMER_ROOT
  ? path.join(process.env.ABOVE_CONSUMER_ROOT, '.above-types')
  : path.join(root, '.artifacts', 'types');
fs.mkdirSync(work, { recursive: true });
if (!process.env.ABOVE_CONSUMER_ROOT) {
  const modules = path.join(work, 'node_modules');
  fs.mkdirSync(modules, { recursive: true });
  if (!fs.existsSync(path.join(modules, 'above-framework')))
    fs.symlinkSync(packageRoot, path.join(modules, 'above-framework'), 'dir');
}
fs.copyFileSync(path.join(root, 'test/types/consumer.ts'), path.join(work, 'consumer.ts'));
const config = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    experimentalDecorators: true,
    target: 'es2017',
    module: 'Node16',
    moduleResolution: 'node16',
    types: ['node'],
  },
  files: [path.join(work, 'consumer.ts')],
};
fs.writeFileSync(path.join(work, 'tsconfig.json'), JSON.stringify(config, null, 2));
const result = childProcess.spawnSync(
  process.execPath,
  [
    require.resolve(legacy ? 'typescript-legacy/bin/tsc' : 'typescript/bin/tsc'),
    '-p',
    path.join(work, 'tsconfig.json'),
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status === null ? 1 : result.status;
