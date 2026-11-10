'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { createInstrumenter } = require('istanbul-lib-instrument');
const root = path.resolve(__dirname, '..');
process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || '') + ' --require ' + JSON.stringify(__filename)).trim();
const transformed = new Map();
global.__coverage__ = {};
function instrument(folder) {
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name);
    if (fs.statSync(file).isDirectory()) {
      instrument(file);
      continue;
    }
    if (!name.endsWith('.ts') || name.endsWith('.d.ts')) continue;
    const instrumenter = createInstrumenter({
      parserPlugins: ['typescript', 'decorators-legacy'],
      produceSourceMap: false,
      compact: false,
    });
    const code = instrumenter.instrumentSync(fs.readFileSync(file, 'utf8'), file);
    global.__coverage__[file] = instrumenter.lastFileCoverage();
    const compiled = ts.transpileModule(code, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
    });
    transformed.set(
      path.join(root, 'build', path.relative(path.join(root, 'src'), file).replace(/\.ts$/, '.js')),
      compiled.outputText,
    );
  }
}
instrument(path.join(root, 'src'));
const original = Module._extensions['.js'];
Module._extensions['.js'] = function covered(module, filename) {
  if (transformed.has(filename)) module._compile(transformed.get(filename), filename);
  else original(module, filename);
};
process.on('exit', () =>
  fs.writeFileSync(
    path.join(process.env.ABOVE_COVERAGE_DIR, process.pid + '.json'),
    JSON.stringify(global.__coverage__),
  ),
);
