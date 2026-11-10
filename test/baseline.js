'use strict';
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'production';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.APP_JWT = 'baseline-example-key-at-least-32-bytes';
const corpus = [
  { method: 'GET', url: '/v1/payment/getItem?name=accepted' },
  { method: 'GET', url: '/v1/payment/getItem' },
  { method: 'POST', url: '/v1/payment/findAll', payload: { name: 'accepted' } },
  { method: 'POST', url: '/v1/payment/findAll?limit=2&offset=3', payload: { name: 'accepted' } },
  { method: 'POST', url: '/v1/payment/findAll', payload: { name: 'fabricio' } },
  { method: 'POST', url: '/v1/payment/findAll', payload: { name: 'error' } },
  { method: 'POST', url: '/v1/payment/findAll', payload: {} },
  { method: 'GET', url: '/v2/payment/getItem?name=accepted' },
  { method: 'POST', url: '/v2/payment/findAll', payload: { name: 'accepted' } },
  { method: 'GET', url: '/health' },
  { method: 'GET', url: '/health/ping' },
  { method: 'GET', url: '/health/check' },
];
async function snapshot(variant) {
  const framework = variant === 'baseline' ? path.join(root, '.artifacts/baseline-framework') : root;
  const above = require(framework);
  const app = new above.Ignition({ path: path.join(root, '.artifacts/baseline-' + variant, 'build') });
  const server = await app.start();
  const responses = [];
  try {
    for (const request of corpus) {
      const response = await server.inject(request);
      responses.push({
        statusCode: response.statusCode,
        body: JSON.parse(response.payload),
        contentType: response.headers['content-type'],
      });
    }
  } finally {
    await server.stop();
  }
  return responses;
}
async function main() {
  const before = await snapshot('baseline');
  const after = await snapshot('updated');
  assert.deepStrictEqual(after, before);
  require('fs').writeFileSync(
    path.join(root, '.artifacts/baseline-results.json'),
    JSON.stringify(
      { reference: 'db5af792785710b3f9ba2ada0499c30b53b65161', requests: corpus, responses: after },
      null,
      2,
    ),
  );
  console.log('All ' + corpus.length + ' original example requests match the pre-update framework.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
