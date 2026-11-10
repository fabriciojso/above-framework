'use strict';
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
module.exports = function pack() {
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, '.artifacts');
  fs.mkdirSync(destination, { recursive: true });
  const result = childProcess.spawnSync('npm', ['pack', '--json', '--pack-destination', destination], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  const metadata = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))[0];
  const tarball = path.join(destination, metadata.filename);
  fs.writeFileSync(
    path.join(destination, 'package.json'),
    JSON.stringify({ tarball, integrity: metadata.integrity, shasum: metadata.shasum, size: metadata.size }, null, 2),
  );
  console.log('Packed ' + metadata.filename + ' (' + metadata.size + ' bytes).');
  return tarball;
};
if (require.main === module) module.exports();
