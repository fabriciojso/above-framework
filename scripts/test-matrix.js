'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const versions = require('../.github/node-versions.json');
const pack = require('./pack');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
const cache = path.join(artifacts, 'runtimes');
const logs = path.join(artifacts, 'matrix');
const image = 'node:26.13.0-bookworm-slim';
const selected = process.argv[2] ? versions.filter((version) => version === process.argv[2]) : versions;
if (!selected.length) throw new Error('Requested Node version is not in the verification matrix.');
async function download(version) {
  const filename = 'node-v' + version + '-linux-x64.tar.xz';
  const archive = path.join(cache, filename);
  const base = 'https://nodejs.org/dist/v' + version + '/';
  const sumsResponse = await fetch(base + 'SHASUMS256.txt');
  if (!sumsResponse.ok) throw new Error('Cannot fetch checksums for Node ' + version);
  const sums = await sumsResponse.text();
  const expected = sums
    .split('\n')
    .find((line) => line.endsWith('  ' + filename))
    .split(/\s+/)[0];
  if (
    !fs.existsSync(archive) ||
    crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== expected
  ) {
    const response = await fetch(base + filename);
    if (!response.ok) throw new Error('Cannot download Node ' + version);
    const data = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(data).digest('hex') !== expected)
      throw new Error('Checksum mismatch for Node ' + version);
    fs.writeFileSync(archive, data);
  }
  if (!fs.existsSync(path.join(cache, 'node-v' + version + '-linux-x64/bin/node'))) {
    const result = childProcess.spawnSync('tar', ['-xJf', archive, '-C', cache], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Cannot extract Node ' + version);
  }
  console.log('Verified Node ' + version + ' download.');
}
async function run(version, tarball) {
  const output = fs.openSync(path.join(logs, version + '.log'), 'w');
  const started = Date.now();
  const args = [
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '-v',
    path.join(root, 'test') + ':/workspace/test:ro',
    '-v',
    path.join(root, 'scripts') + ':/workspace/scripts:ro',
    '-v',
    artifacts + ':/workspace/.artifacts',
    '-w',
    '/workspace',
    '-e',
    'ABOVE_TARBALL=' + path.basename(tarball),
    image,
    'node',
    'scripts/run-runtime.js',
    version,
  ];
  const status = await new Promise((resolve, reject) => {
    const child = childProcess.spawn('docker', args, { stdio: ['ignore', output, output] });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  fs.closeSync(output);
  console.log(
    'Node ' +
      version +
      ': ' +
      (status === 0 ? 'PASS' : 'FAIL') +
      ' (' +
      Math.round((Date.now() - started) / 1000) +
      's).',
  );
  return {
    version,
    passed: status === 0,
    seconds: Math.round((Date.now() - started) / 1000),
    log: '.artifacts/matrix/' + version + '.log',
  };
}
async function main() {
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  // Limit concurrent downloads and runtime jobs so validation does not exhaust the host.
  for (let i = 0; i < selected.length; i += 4) await Promise.all(selected.slice(i, i + 4).map(download));
  const tarball = process.env.ABOVE_TARBALL || pack();
  const results = [];
  for (let i = 0; i < selected.length; i += 4)
    results.push(...(await Promise.all(selected.slice(i, i + 4).map((version) => run(version, tarball)))));
  fs.writeFileSync(
    path.join(logs, 'results.json'),
    JSON.stringify({ testedAt: new Date().toISOString(), image, results }, null, 2),
  );
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
