'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const reference = 'db5af792785710b3f9ba2ada0499c30b53b65161';
const baseline = path.join(root, '.artifacts/baseline-framework');
fs.rmSync(baseline, { recursive: true, force: true });
fs.mkdirSync(baseline, { recursive: true });
function original(file) {
  return childProcess.execFileSync('git', ['show', reference + ':' + file], { cwd: root, encoding: 'utf8' });
}
const manifest = JSON.parse(original('package.json'));
delete manifest.devDependencies;
manifest.scripts = {};
fs.writeFileSync(path.join(baseline, 'package.json'), JSON.stringify(manifest));
const files = childProcess
  .execFileSync('git', ['ls-tree', '-r', '--name-only', reference, 'src'], { encoding: 'utf8', cwd: root })
  .trim()
  .split('\n')
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'));
for (const file of files) {
  const output = path.join(baseline, 'build', file.slice(4).replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    ts.transpileModule(original(file), {
      compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
  );
}
const installed = childProcess.spawnSync(
  'npm',
  ['install', '--omit=dev', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'],
  { cwd: baseline, stdio: 'inherit' },
);
if (installed.status !== 0) process.exit(installed.status || 1);
const exampleFiles = childProcess
  .execFileSync('git', ['ls-tree', '-r', '--name-only', reference, 'example/api'], { encoding: 'utf8', cwd: root })
  .trim()
  .split('\n')
  .filter((file) => file.endsWith('.ts'));
for (const [variant, framework] of [
  ['baseline', baseline],
  ['updated', root],
]) {
  const app = path.join(root, '.artifacts/baseline-' + variant);
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'example-consumer', version: '1.0.0' }));
  fs.symlinkSync(path.join(framework, 'node_modules'), path.join(app, 'node_modules'), 'dir');
  for (const file of exampleFiles) {
    const source = original(file)
      .replace(/from ['"](?:\.\.\/)+src(?:\/index)?['"]/g, 'from ' + JSON.stringify(framework))
      .replace(
        /from ['"](?:\.\.\/)+src\/core\/decorators['"]/g,
        'from ' + JSON.stringify(path.join(framework, 'build/core/decorators')),
      );
    const output = path.join(app, 'build', file.slice('example/'.length).replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(
      output,
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2017,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          experimentalDecorators: true,
        },
      }).outputText,
    );
  }
}
const result = childProcess.spawnSync(process.execPath, [path.join(root, 'test/baseline.js')], { stdio: 'inherit' });
process.exitCode = result.status === 0 ? 0 : 1;
