'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const semver = require('semver');
const productionTree = require('./production-tree');
const root = path.resolve(__dirname, '..');
const Module = require('module');
const builtins = new Set(Module.builtinModules.map((name) => name.replace(/^node:/, '')));
let files = 0;
function compile(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') compile(file);
    if (!entry.isFile() || !/\.(c?js)$/.test(entry.name)) continue;
    const original = fs.readFileSync(file, 'utf8');
    const resolveRequires = (context) => {
      const visit = (node) => {
        const directRequire = ts.isIdentifier(node.expression || {}) && node.expression.text === 'require';
        const requireResolve =
          ts.isPropertyAccessExpression(node.expression || {}) &&
          node.expression.expression.getText() === 'require' &&
          node.expression.name.text === 'resolve';
        if (
          ts.isCallExpression(node) &&
          (directRequire || requireResolve) &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const specifier = node.arguments[0].text;
          let replacement = specifier;
          if (specifier.startsWith('node:') && builtins.has(specifier.slice(5))) replacement = specifier.slice(5);
          else if (!specifier.startsWith('.') && !builtins.has(specifier)) {
            try {
              const resolved = require.resolve(specifier, { paths: [folder] });
              if (path.isAbsolute(resolved))
                replacement = './' + path.relative(folder, resolved).split(path.sep).join('/');
            } catch (_) {
              /* Optional dependency or a runtime-only import. */
            }
          }
          if (replacement !== specifier)
            return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              ts.factory.createStringLiteral(replacement),
            ]);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (source) => ts.visitNode(source, visit);
    };
    const result = ts.transpileModule(original, {
      fileName: file,
      compilerOptions: {
        allowJs: true,
        target: ts.ScriptTarget.ES2017,
        module: ts.ModuleKind.CommonJS,
        newLine: ts.NewLineKind.LineFeed,
        removeComments: false,
      },
      transformers: { before: [resolveRequires] },
    });
    fs.writeFileSync(file, result.outputText);
    files++;
  }
}
const dependencies = productionTree(root);
for (const item of dependencies) {
  const engine = item.manifest.engines && item.manifest.engines.node;
  if (typeof engine === 'string' && !semver.satisfies('12.0.0', engine))
    throw new Error(item.manifest.name + '@' + item.manifest.version + ' requires Node ' + engine);
  compile(item.folder);
}
console.log(
  'Prepared ' + dependencies.length + ' bundled production packages (' + files + ' JavaScript files) for Node 12.0+.',
);
