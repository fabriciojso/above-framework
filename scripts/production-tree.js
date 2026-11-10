'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

module.exports = function productionTree(root) {
  const visited = new Set();
  const packages = [];
  function visit(folder) {
    if (visited.has(folder)) return;
    visited.add(folder);
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
    if (folder !== root) packages.push({ folder, manifest });
    const optional = manifest.optionalDependencies || {};
    const dependencies =
      folder === root
        ? Object.fromEntries(manifest.bundleDependencies.map((name) => [name, manifest.dependencies[name]]))
        : Object.assign({}, manifest.dependencies, optional);
    for (const name of Object.keys(dependencies)) {
      const location = Module._nodeModulePaths(folder)
        .map((base) => path.join(base, name))
        .find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
      if (location) visit(location);
      else if (!Object.prototype.hasOwnProperty.call(optional, name))
        throw new Error('Missing production dependency: ' + name);
    }
  }
  visit(root);
  return packages;
};
