'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.resolve(process.env.ABOVE_PACKAGE_ROOT || path.join(__dirname, '..'));
const dependency = (name) =>
  require(
    require.resolve(name, {
      paths: [
        process.env.ABOVE_CONSUMER_ROOT && (name === 'joi' || name === '@hapi/joi')
          ? process.env.ABOVE_CONSUMER_ROOT
          : root,
      ],
    }),
  );
const feature = (name) => require(path.join(root, 'build', name)).default;
process.env.APP_JWT = 'integration-test-key-with-at-least-32-bytes';
process.env.JWT = process.env.APP_JWT;
process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
const above = require(root);
const { Hapi } = above;
const Joi = dependency('joi');
const LegacyJoi = dependency('@hapi/joi');
const jwt = dependency('jsonwebtoken');
const tests = [];
const servers = [];
const folders = [];
const stopped = new WeakSet();
async function stopServer(s) {
  if (!stopped.has(s)) {
    stopped.add(s);
    await s.stop({ timeout: 100 });
  }
}
function test(name, run) {
  tests.push({ name, run });
}
async function server(options) {
  const s = new Hapi.Server(
    Object.assign(
      {
        port: 0,
        host: '127.0.0.1',
        routes: {
          validate: {
            failAction: (_request, _h, error) => {
              throw error;
            },
          },
        },
      },
      options,
    ),
  );
  s.validator(feature('core/joi-compat'));
  servers.push(s);
  feature('core/exception-manager').set(s);
  await s.register(feature('plugins/jwt'));
  return s;
}
function route(s, options) {
  const RoutesManager = feature('core/routes-manager');
  const settings = Object.assign({ auth: false }, options.settings);
  const manager = new RoutesManager(
    {
      method: options.method || 'POST',
      pathname: options.path || '/feature',
      descriptor: { value: options.handler || (async ({ request, reply }) => reply.response(request.payload)) },
    },
    settings,
  );
  s.route(manager.get()('/v1'));
}
function appFolder() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'above-integration-'));
  folders.push(folder);
  fs.writeFileSync(
    path.join(folder, 'package.json'),
    JSON.stringify({ name: 'consumer-fixture', version: '1.0.0', description: 'Consumer integration fixture' }),
  );
  const app = path.join(folder, 'build');
  fs.mkdirSync(app);
  return app;
}
function removeFolder(folder) {
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name);
    if (fs.lstatSync(file).isDirectory()) removeFolder(file);
    else fs.unlinkSync(file);
  }
  fs.rmdirSync(folder);
}
async function capture(stream, run) {
  const original = stream.write;
  const output = [];
  stream.write = function (chunk, encoding, callback) {
    output.push(String(chunk));
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };
  try {
    return { result: await run(), output: output.join('') };
  } finally {
    stream.write = original;
  }
}
test('the original Joi 15 import and the new Joi 17 import validate real requests', async () => {
  assert.strictEqual(Joi.version, '17.13.9');
  assert.strictEqual(LegacyJoi.version, '15.1.1');
  assert.strictEqual(above.Joi.version, '15.1.1');
  for (const name of ['@hapi/joi', 'joi']) {
    const imported = dependency(name);
    const s = await server();
    route(s, { settings: { validate: { payload: imported.object({ id: imported.number().required() }) } } });
    const response = await s.inject({ method: 'POST', url: '/v1/feature', payload: { id: '12' } });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.result, { id: 12 });
  }
});
test('Joi 15 and Joi 17 raw maps and paginated schemas work side by side', async () => {
  const s = await server();
  for (const [version, factory] of [
    ['15', LegacyJoi],
    ['17', Joi],
  ]) {
    route(s, {
      path: '/joi-' + version,
      settings: {
        paginate: true,
        records: true,
        validate: {
          query: factory.object({ search: factory.string().required() }),
          payload: { id: factory.number().required() },
        },
      },
    });
    const response = await s.inject({
      method: 'POST',
      url: '/v1/joi-' + version + '?search=kept&limit=2',
      payload: { id: '7' },
    });
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.result));
    assert.strictEqual(response.result.meta.limit, 2);
    assert.deepStrictEqual(response.result.records, [{ id: 7 }]);
    const invalid = await s.inject({
      method: 'POST',
      url: '/v1/joi-' + version + '?search=kept',
      payload: { id: 'wrong' },
    });
    assert.strictEqual(invalid.statusCode, 400);
    assert.strictEqual(invalid.result.errorCode, 20007);
  }
});
test('Swagger documents legacy and modern schemas without changing live validators', async () => {
  const app = appFolder();
  const s = await new above.Ignition({ path: app }).start();
  servers.push(s);
  for (const [version, factory] of [
    ['15', LegacyJoi],
    ['17', Joi],
  ]) {
    route(s, {
      path: '/documented-' + version,
      settings: {
        validate: {
          payload: factory
            .object({
              name: factory.string().min(2).required(),
              count: factory.number().min(1).max(5).default(2),
              nested: factory.object({ enabled: factory.boolean() }),
              items: factory.array().items(factory.string()),
              choice: factory.string().valid('one', 'two'),
              date: factory.date().iso(),
              nullable: factory.string().allow(null),
            })
            .label('Consumer' + version),
          query: factory.object({ search: factory.string() }),
        },
        response: { schema: factory.object({ name: factory.string() }) },
      },
    });
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    const spec = await s.inject('/swagger.json');
    assert.strictEqual(spec.statusCode, 200, JSON.stringify(spec.result));
    for (const version of ['15', '17']) {
      assert.ok(spec.result.paths['/v1/documented-' + version]);
      assert.strictEqual(spec.result.definitions['Consumer' + version].properties.name.type, 'string');
      assert.strictEqual(spec.result.definitions['Consumer' + version].properties.name.minLength, 2);
      assert.ok(spec.result.definitions['Consumer' + version].required.includes('name'));
      const response = await s.inject({ method: 'POST', url: '/v1/documented-' + version, payload: { name: 'valid' } });
      assert.strictEqual(response.statusCode, 200);
      assert.deepStrictEqual(response.result, { name: 'valid', count: 2 });
      const invalid = await s.inject({ method: 'POST', url: '/v1/documented-' + version, payload: { name: 'x' } });
      assert.strictEqual(invalid.statusCode, 400);
      assert.strictEqual(invalid.result.errorCode, 20087);
    }
  }
});
test('Swagger retains legacy alternatives, patterns, metadata and response status schemas', async () => {
  const s = await server();
  const custom = LegacyJoi.extend({ name: 'custom', base: LegacyJoi.string() });
  route(s, {
    settings: {
      validate: {
        payload: LegacyJoi.object({
          pattern: LegacyJoi.string().regex(/^kept/).description('Pattern description').meta({ note: 'retained' }),
          alternative: LegacyJoi.alternatives().try(LegacyJoi.string(), LegacyJoi.number()),
          conditional: LegacyJoi.alternatives().when('flag', {
            is: true,
            then: LegacyJoi.string(),
            otherwise: LegacyJoi.number(),
          }),
          onlyThen: LegacyJoi.alternatives().when('flag', { is: true, then: LegacyJoi.string() }),
          onlyOtherwise: LegacyJoi.alternatives().when('flag', { is: true, otherwise: LegacyJoi.number() }),
          trimmed: LegacyJoi.string().trim(),
          extension: custom.custom(),
        }),
      },
      response: { status: { 201: LegacyJoi.object({ id: LegacyJoi.number() }) } },
    },
  });
  await s.register({
    plugin: feature('plugins/swagger-compat'),
    options: {
      info: { title: 'consumer', version: '1.0.0' },
      documentationPage: false,
      swaggerUI: false,
      cache: { expiresIn: 1000 },
    },
  });
  await s.initialize();
  for (let repeat = 0; repeat < 2; repeat++) {
    const response = await s.inject('/swagger.json');
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.result));
    assert.ok(response.result.paths['/v1/feature'].post.responses['201']);
    const body = response.result.paths['/v1/feature'].post.parameters.find((parameter) => parameter.in === 'body');
    assert.ok(body);
    assert.ok(JSON.stringify(response.result).includes('Pattern description'));
  }
});
test('legacy references keep Swagger available and keep live validation in Joi 15', async () => {
  const s = await new above.Ignition({ path: appFolder() }).start();
  servers.push(s);
  route(s, {
    settings: {
      validate: {
        payload: LegacyJoi.object({
          minimum: LegacyJoi.number(),
          value: LegacyJoi.number().min(LegacyJoi.ref('minimum')),
          context: LegacyJoi.number().max(LegacyJoi.ref('$maximum')),
          nested: LegacyJoi.object({ minimum: LegacyJoi.number() }),
          custom: LegacyJoi.number().min(LegacyJoi.ref('nested/minimum', { separator: '/' })),
          values: LegacyJoi.array().items(LegacyJoi.number().min(LegacyJoi.ref('$minimum'))),
        }).label('LegacyReferences'),
      },
    },
  });
  const spec = await s.inject('/swagger.json');
  assert.strictEqual(spec.statusCode, 200, spec.payload);
  const properties = spec.result.definitions.LegacyReferences.properties;
  assert.deepStrictEqual(properties.value.minimum.ref.path, ['minimum']);
  assert.deepStrictEqual(properties.custom.minimum.ref.path, ['nested', 'minimum']);
  assert.strictEqual(properties.context.maximum.ref.type, 'global');
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/feature', payload: { minimum: 2, value: 3 } })).statusCode,
    200,
  );
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/feature', payload: { minimum: 2, value: 1 } })).statusCode,
    400,
  );
});
test('legacy examples and documentation metadata are retained', async () => {
  const s = await new above.Ignition({ path: appFolder() }).start();
  servers.push(s);
  route(s, {
    settings: {
      validate: {
        payload: LegacyJoi.object({
          name: LegacyJoi.string().example('Jane').notes('Name note').tags('identity').unit('characters'),
        }).label('LegacyExamples'),
      },
    },
  });
  const spec = await s.inject('/swagger.json');
  assert.strictEqual(spec.statusCode, 200, spec.payload);
  assert.strictEqual(spec.result.definitions.LegacyExamples.properties.name.example, 'Jane');
});
test('legacy raw maps containing only references use the legacy compiler', async () => {
  const s = await server();
  route(s, { settings: { validate: { payload: { minimum: 1, value: LegacyJoi.ref('minimum') } } } });
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/feature', payload: { minimum: 1, value: 1 } })).statusCode,
    200,
  );
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/feature', payload: { minimum: 1, value: 2 } })).statusCode,
    400,
  );
});
test('consumer decorators can register multiple methods on one controller', async () => {
  const s = await server();
  class MultipleController {
    async one({ reply }) {
      return reply.response({ method: 'one' });
    }
    async two({ reply }) {
      return reply.response({ method: 'two' });
    }
  }
  above.Get('/one', { auth: false })(
    MultipleController.prototype,
    'one',
    Object.getOwnPropertyDescriptor(MultipleController.prototype, 'one'),
  );
  above.Post('/two', { auth: false })(
    MultipleController.prototype,
    'two',
    Object.getOwnPropertyDescriptor(MultipleController.prototype, 'two'),
  );
  new (above.Controller('/multiple')(MultipleController))(s, 'v1');
  assert.deepStrictEqual((await s.inject('/v1/multiple/one')).result, { method: 'one' });
  assert.deepStrictEqual((await s.inject({ method: 'POST', url: '/v1/multiple/two' })).result, { method: 'two' });
});
test('schema compilation handles literal maps and rejects cyclic consumer configuration safely', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    settings: { validate: { query: { mode: 'exact' } } },
    handler: async ({ reply }) => reply.response({ validated: true }),
  });
  assert.strictEqual((await s.inject('/v1/feature?mode=exact')).statusCode, 200);
  assert.strictEqual((await s.inject('/v1/feature?mode=wrong')).statusCode, 400);
  route(s, { path: '/literal-first', settings: { validate: { payload: { literal: 'exact', name: Joi.string() } } } });
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/literal-first', payload: { literal: 'exact', name: 'kept' } }))
      .statusCode,
    200,
  );
  const cyclic = {};
  cyclic.self = cyclic;
  s.route({
    method: 'GET',
    path: '/bad-config',
    options: { auth: false },
    handler: (_, h) => {
      try {
        s.route({
          method: 'GET',
          path: '/cannot-register',
          options: { validate: { query: cyclic } },
          handler: () => 'never',
        });
      } catch (error) {
        return h.response({ rejected: error instanceof Error }).code(400);
      }
      return h.response().code(500);
    },
  });
  assert.deepStrictEqual((await s.inject('/bad-config')).result, { rejected: true });
});
test('Hapi validates nested input, converts primitives and applies defaults through Above routes', async () => {
  const s = await server();
  route(s, {
    settings: {
      validate: {
        payload: Joi.object({
          nested: Joi.object({ id: Joi.number().required() }).required(),
          enabled: Joi.boolean().default(true),
        }),
      },
    },
  });
  const response = await s.inject({ method: 'POST', url: '/v1/feature', payload: { nested: { id: '7' } } });
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.result, { nested: { id: 7 }, enabled: true });
});
test('pagination and records wrap the converted payload using the public response format', async () => {
  const s = await server();
  route(s, { settings: { paginate: true, records: true } });
  const response = await s.inject({ method: 'POST', url: '/v1/feature?limit=2&offset=3', payload: { id: 9 } });
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.result, {
    meta: { server: 'machine.testing.local', offset: 3, limit: 2, recordCount: 1 },
    records: [{ id: 9 }],
  });
});
test('JWT defaults protect routes and reject expired, forged and wrong-algorithm tokens', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    settings: { auth: 'jwt' },
    handler: async ({ reply }) => reply.response({ authorized: true }),
  });
  const tokens = [
    undefined,
    jwt.sign({}, process.env.APP_JWT, { expiresIn: -1 }),
    jwt.sign({}, 'a-different-key'),
    jwt.sign({}, process.env.APP_JWT, { algorithm: 'HS384' }),
  ];
  for (const token of tokens) {
    const response = await s.inject({ url: '/v1/feature', headers: token ? { authorization: 'Bearer ' + token } : {} });
    assert.strictEqual(response.statusCode, 401);
    assert.strictEqual(response.result.errorCode, 30001);
  }
  const response = await s.inject({
    url: '/v1/feature',
    headers: { authorization: 'Bearer ' + jwt.sign({ id: 1 }, process.env.APP_JWT) },
  });
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.result, { authorized: true });
});
test('all public method decorators register the expected versioned controller routes', async () => {
  const s = await server();
  for (const method of ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head']) {
    class MethodsController {
      async handle({ reply }) {
        return reply.response({ method });
      }
    }
    above[method]('/action', { auth: false })(
      MethodsController.prototype,
      'handle',
      Object.getOwnPropertyDescriptor(MethodsController.prototype, 'handle'),
    );
    const Decorated = above.Controller('/methods')(MethodsController);
    new Decorated(s, method.toLowerCase());
    const response = await s.inject({
      method: method.toUpperCase(),
      url: '/' + method.toLowerCase() + '/methods/action',
    });
    assert.strictEqual(response.statusCode, 200);
    if (method !== 'Head') assert.deepStrictEqual(response.result, { method });
    else assert.strictEqual((await s.inject('/head/methods/action')).statusCode, 404);
  }
  class EmptyController {}
  new (above.Controller()(EmptyController))(s, 'v1');
});
test('middleware runs sequentially and can terminate a request before the controller', async () => {
  const s = await server();
  const visited = [];
  route(s, {
    settings: {
      middleware: [
        async (_, h) => {
          visited.push(1);
          return h.continue;
        },
        async (_, h) => {
          visited.push(2);
          return h.response({ stopped: true }).code(202);
        },
      ],
    },
    handler: async () => {
      throw new Error('controller must not run');
    },
  });
  const response = await s.inject({ method: 'POST', url: '/v1/feature' });
  assert.strictEqual(response.statusCode, 202);
  assert.deepStrictEqual(response.result, { stopped: true });
  assert.deepStrictEqual(visited, [1, 2]);
  route(s, {
    path: '/continue',
    settings: { middleware: [async (_, h) => h.continue] },
    handler: async ({ reply, request }) =>
      reply.response({ sameRequest: request.additional.path, paginate: request.paginate }),
  });
  assert.deepStrictEqual((await s.inject({ method: 'POST', url: '/v1/continue' })).result, {
    sameRequest: '/v1/continue',
    paginate: { offset: 0, limit: 50 },
  });
});
test('record arrays, empty arrays and default pagination keep their public envelope', async () => {
  const s = await server();
  for (const value of [[], [{ id: 1 }, { id: 2 }]]) {
    const endpoint = value.length ? '/array' : '/empty';
    route(s, {
      path: endpoint,
      settings: { records: true, paginate: true, validate: { query: Joi.object({ search: Joi.string() }) } },
      handler: async ({ reply }) => reply.response(value),
    });
    const response = await s.inject({ method: 'POST', url: '/v1' + endpoint });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.result, {
      meta: { server: 'machine.testing.local', offset: 0, limit: 50, recordCount: value.length },
      records: value,
    });
  }
});
const validationCases = [
  ['required', () => Joi.string().required(), undefined, 20001],
  ['empty string', () => Joi.string(), '', 20001],
  ['allowed values', () => Joi.string().valid('one', 'two'), 'three', 20018],
  ['invalid value', () => Joi.string().invalid('blocked'), 'blocked', 20003],
  ['array type', () => Joi.array(), {}, 20016],
  ['required array item', () => Joi.array().items(Joi.string().required()), [], 20001],
  ['minimum array length', () => Joi.array().min(2), [], 20001],
  [
    'array uniqueness',
    () =>
      Joi.array()
        .items(Joi.object({ id: Joi.number() }))
        .unique('id'),
    [{ id: 1 }, { id: 1 }],
    20043,
  ],
  ['boolean', () => Joi.boolean(), 'invalid', 20009],
  ['date', () => Joi.date(), 'invalid', 20008],
  ['ISO date', () => Joi.date().iso(), 'invalid', 20008],
  ['latest date', () => Joi.date().max('2020-01-01'), '2021-01-01', 20088],
  ['earliest date', () => Joi.date().min('2020-01-01'), '2019-01-01', 20088],
  ['strictly later date', () => Joi.date().greater('2020-01-01'), '2019-01-01', 20141],
  ['integer', () => Joi.number().integer(), 1.5, 20002],
  ['number', () => Joi.number(), 'invalid', 20007],
  ['maximum number', () => Joi.number().max(2), 3, 20088],
  ['minimum number', () => Joi.number().min(2), 1, 20087],
  ['decimal precision', () => Joi.number().precision(1).strict(), 1.23, 20082],
  ['unknown object key', () => Joi.object({ known: Joi.string() }).unknown(false), { other: 'x' }, 20006],
  ['required object peers', () => Joi.object({ a: Joi.string(), b: Joi.string() }).or('a', 'b'), {}, 20042],
  ['all object peers', () => Joi.object({ a: Joi.string(), b: Joi.string() }).and('a', 'b'), { a: 'a' }, 20001],
  ['object', () => Joi.object(), 'invalid', 20019],
  [
    'forbidden peer combination',
    () => Joi.object({ a: Joi.string(), b: Joi.string() }).nand('a', 'b'),
    { a: 'a', b: 'b' },
    20042,
  ],
  [
    'exclusive object peers',
    () => Joi.object({ a: Joi.string(), b: Joi.string() }).xor('a', 'b'),
    { a: 'a', b: 'b' },
    20042,
  ],
  ['dependent peer', () => Joi.object({ a: Joi.string(), b: Joi.string() }).with('a', 'b'), { a: 'a' }, 20017],
  [
    'incompatible peer',
    () => Joi.object({ a: Joi.string(), b: Joi.string() }).without('a', 'b'),
    { a: 'a', b: 'b' },
    20042,
  ],
  ['string', () => Joi.string(), 2, 20003],
  ['minimum string', () => Joi.string().min(3), 'ab', 20087],
  ['maximum string', () => Joi.string().max(1), 'ab', 20088],
  ['exact string length', () => Joi.string().length(3), 'ab', 20083],
  ['guid', () => Joi.string().guid(), 'invalid', 20012],
  ['uri', () => Joi.string().uri(), 'invalid', 20089],
  ['email', () => Joi.string().email(), 'invalid', 20013],
  ['uncatalogued rule', () => Joi.string().alphanum(), 'with spaces', 20020],
];
for (const [name, schema, value, errorCode] of validationCases) {
  test('Joi validation preserves the Above error contract: ' + name, async () => {
    const s = await server();
    route(s, { settings: { validate: { payload: Joi.object({ field: schema() }) } } });
    const response = await s.inject({
      method: 'POST',
      url: '/v1/feature',
      payload: value === undefined ? {} : { field: value },
    });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(response.result.errorCode, errorCode, JSON.stringify(response.result));
    assert.strictEqual(typeof response.result.developerMessage, 'string');
    assert.strictEqual(typeof response.result.userMessage, 'string');
  });
}
test('payload, query and path validation preserve source names and nested array paths', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    path: '/{id}',
    settings: {
      validate: { params: Joi.object({ id: Joi.number() }), query: Joi.object({ name: Joi.string().required() }) },
    },
  });
  assert.strictEqual((await s.inject('/v1/wrong?name=ok')).result.errorCode, 20007);
  assert.strictEqual((await s.inject('/v1/1')).result.errorCode, 20001);
  for (const [endpoint, schema, payload] of [
    ['/array-start', Joi.array().items(Joi.object({ id: Joi.number() })), [{ id: 'bad' }]],
    [
      '/array-inner',
      Joi.object({ items: Joi.array().items(Joi.object({ id: Joi.number() })) }),
      { items: [{ id: 'bad' }] },
    ],
    ['/array-end', Joi.object({ items: Joi.array().items(Joi.number()) }), { items: ['bad'] }],
  ]) {
    route(s, { path: endpoint, settings: { validate: { payload: schema } } });
    const response = await s.inject({ method: 'POST', url: '/v1' + endpoint, payload });
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(response.result.errorCode, 20007);
    assert.ok(response.result.developerMessage.includes('[0]'));
  }
});
test('BaseException and unexpected handler errors keep their status and public body', async () => {
  const s = await server();
  class BusinessError extends above.BaseException {
    constructor() {
      super({ developerMessage: 'Missing payment', errorCode: 12345, statusCode: 404, userMessage: 'Not found' });
    }
  }
  const business = new BusinessError();
  assert.deepStrictEqual(business.getSchema()['404 - BusinessError'], {
    developerMessage: 'Missing payment',
    errorCode: 12345,
    statusCode: 404,
    userMessage: 'Not found',
    moreInfo: 'http://www.developer.apiluiza.com.br/errors',
    errorName: 'BusinessError',
  });
  route(s, {
    path: '/business',
    handler: async () => {
      throw business;
    },
  });
  route(s, {
    path: '/unexpected',
    handler: async () => {
      throw new Error('internal details');
    },
  });
  const custom = await s.inject({ method: 'POST', url: '/v1/business' });
  assert.strictEqual(custom.statusCode, 404);
  assert.strictEqual(custom.result.errorCode, 12345);
  const unexpected = await s.inject({ method: 'POST', url: '/v1/unexpected' });
  assert.strictEqual(unexpected.statusCode, 500);
  assert.strictEqual(unexpected.result.errorCode, 10000);
  assert.ok(!JSON.stringify(unexpected.result).includes('internal details'));
});
test('environment values retain strings, booleans, integers and falsy defaults through a controller', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    handler: async ({ reply }) => {
      const values = {};
      for (const [name, value] of [
        ['STRING', 'text'],
        ['BOOL', 'true'],
        ['FALSE', 'false'],
        ['NUMBER', '42'],
        ['ZERO', '0'],
        ['EMPTY', ''],
      ]) {
        process.env['ABOVE_TEST_' + name] = value;
        values[name] = above.EnvManager.get('ABOVE_TEST_' + name);
      }
      values.defaultZero = above.EnvManager.get('ABOVE_TEST_MISSING', { defaultValue: 0 });
      values.defaultFalse = above.EnvManager.get('ABOVE_TEST_MISSING', { defaultValue: false });
      values.defaultText = above.EnvManager.get('ABOVE_TEST_MISSING', { defaultValue: 'fallback' });
      return reply.response(values);
    },
  });
  const response = await s.inject('/v1/feature');
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.result, {
    STRING: 'text',
    BOOL: true,
    FALSE: false,
    NUMBER: 42,
    ZERO: 0,
    EMPTY: '',
    defaultZero: 0,
    defaultFalse: false,
    defaultText: 'fallback',
  });
});
test('global schemas include and exclude routes, merge Joi objects and support raw schema maps', async () => {
  const s = await server();
  const Manager = feature('core/routes-manager');
  Manager.defineSchemes([
    {
      include: /included/,
      exclude: /excluded/,
      source: {
        headers: { 'x-consumer': Joi.string().required() },
        query: { global: Joi.number().default(4) },
        params: { id: Joi.number() },
        payload: { extra: Joi.string() },
      },
    },
    { source: {} },
    { include: /never/, source: { query: { missing: Joi.string().required() } } },
    { exclude: /excluded/, source: {} },
  ]);
  try {
    route(s, {
      path: '/included/{id}',
      settings: { validate: { query: Joi.object({ local: Joi.string() }) } },
      handler: async ({ request, reply }) =>
        reply.response({ params: request.params, query: request.query, payload: request.payload }),
    });
    route(s, {
      path: '/included-excluded',
      settings: { validate: { query: { local: Joi.string() } } },
      handler: async ({ reply }) => reply.response({ excluded: true }),
    });
    route(s, {
      path: '/included-raw/{id}',
      settings: { validate: { query: { local: Joi.string() } } },
      handler: async ({ reply, request }) => reply.response(request.query),
    });
    assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/included/1' })).statusCode, 400);
    const response = await s.inject({
      method: 'POST',
      url: '/v1/included/1?local=yes',
      headers: { 'x-consumer': 'unchanged' },
      payload: { extra: 'accepted' },
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(response.payload), {
      params: { id: 1 },
      query: { local: 'yes', global: 4 },
      payload: { extra: 'accepted' },
    });
    assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/included-excluded' })).statusCode, 200);
    assert.deepStrictEqual(
      JSON.parse(
        (
          await s.inject({
            method: 'POST',
            url: '/v1/included-raw/1?local=kept',
            headers: { 'x-consumer': 'unchanged' },
            payload: {},
          })
        ).payload,
      ),
      { local: 'kept' },
    );
  } finally {
    Manager.defineSchemes([]);
  }
});
test('global schema regular expressions are evaluated once per route', async () => {
  const s = await server();
  const Manager = feature('core/routes-manager');
  Manager.defineSchemes([{ include: /stateful/g, source: { headers: { 'x-stateful': Joi.string().required() } } }]);
  try {
    route(s, { path: '/stateful', handler: async ({ reply }) => reply.response({ retained: true }) });
    assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/stateful' })).statusCode, 400);
    assert.strictEqual(
      (await s.inject({ method: 'POST', url: '/v1/stateful', headers: { 'x-stateful': 'present' } })).statusCode,
      200,
    );
  } finally {
    Manager.defineSchemes([]);
  }
});
test('multipart uploads pass through Hapi and reject duplicate disposition parameters', async () => {
  const s = await server();
  route(s, {
    settings: {
      payload: { multipart: true, parse: true, output: 'data', allow: 'multipart/form-data' },
      validate: { payload: Joi.object({ name: Joi.string().required(), file: Joi.any().required() }) },
    },
    handler: async ({ request, reply }) =>
      reply.response({ name: request.payload.name, file: request.payload.file.toString('utf8') }),
  });
  const boundary = 'above-integration-boundary';
  const body =
    '--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="name"\r\n\r\nconsumer\r\n--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="file"; filename="example.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--' +
    boundary +
    '--\r\n';
  const headers = { 'content-type': 'multipart/form-data; boundary=' + boundary };
  const response = await s.inject({ method: 'POST', url: '/v1/feature', headers, payload: body });
  assert.strictEqual(response.statusCode, 200, response.payload);
  assert.deepStrictEqual(response.result, { name: 'consumer', file: 'hello' });
  const duplicate = body.replace('name="file";', 'name="file"; name="other";');
  assert.strictEqual(
    (await s.inject({ method: 'POST', url: '/v1/feature', headers, payload: duplicate })).statusCode,
    400,
  );
});
test('static files remain confined to their directory across sibling-prefix traversal attempts', async () => {
  const s = await server();
  await s.register(dependency('@hapi/inert'));
  const app = appFolder();
  const publicDir = path.join(app, 'public');
  const sibling = path.join(app, 'public-secret');
  fs.mkdirSync(publicDir);
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(publicDir, 'hello.txt'), 'public content');
  fs.writeFileSync(path.join(sibling, 'secret.txt'), 'private sibling content');
  s.route({
    method: 'GET',
    path: '/files/{path*}',
    options: { auth: false },
    handler: { directory: { path: publicDir } },
  });
  assert.strictEqual((await s.inject('/files/hello.txt')).payload, 'public content');
  const response = await s.inject('/files/..%2fpublic-secret%2fsecret.txt');
  assert.notStrictEqual(response.statusCode, 200);
  assert.ok(!response.payload.includes('private sibling content'));
});
test('configured request timeouts are enforced by Hapi before a slow controller completes', async () => {
  process.env.TIMEOUT = '1';
  try {
    const app = appFolder();
    const s = await new above.Ignition({ path: app }).start();
    servers.push(s);
    route(s, {
      method: 'GET',
      handler: async ({ reply }) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return reply.response({ tooLate: true });
      },
    });
    const response = await s.inject('/v1/feature');
    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(response.result.errorCode, 20020);
  } finally {
    delete process.env.TIMEOUT;
  }
});
test('response validation keeps the established ignore policy and missing handlers fail safely', async () => {
  const s = await server();
  route(s, {
    path: '/',
    settings: { response: { schema: Joi.number() }, middleware: [] },
    handler: async ({ reply }) => reply.response({ intentionally: 'not a number' }),
  });
  assert.deepStrictEqual((await s.inject({ method: 'POST', url: '/v1' })).result, { intentionally: 'not a number' });
  const Manager = feature('core/routes-manager');
  s.route(new Manager({ method: 'GET', pathname: '/missing', descriptor: {} }, { auth: false }).get()('/v1'));
  assert.strictEqual((await s.inject('/v1/missing')).statusCode, 204);
});
test('required environment diagnostics and absent values work inside a consumer route', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    handler: async ({ reply }) =>
      reply.response({
        missing: above.EnvManager.get('ABOVE_TEST_MISSING', { required: true }),
        optional: above.EnvManager.get('ABOVE_TEST_MISSING'),
        existing: above.EnvManager.get('ABOVE_TEST_NUMBER', { required: true }),
      }),
  });
  const captured = await capture(process.stderr, () => s.inject('/v1/feature'));
  assert.strictEqual(captured.result.statusCode, 200);
  assert.strictEqual(captured.result.result.existing, 42);
  assert.ok(captured.output.includes('ABOVE_TEST_MISSING'));
});
test('health controllers distinguish database availability and shutdown through Hapi handlers', async () => {
  const s = await server();
  const HealthController = feature('plugins/health/health.controller');
  const healthy = new HealthController({ authenticate: async () => undefined });
  const unhealthy = new HealthController({
    authenticate: async () => {
      throw new Error('database unavailable');
    },
  });
  for (const [endpoint, controller] of [
    ['healthy', healthy],
    ['unhealthy', unhealthy],
  ])
    s.route({
      method: 'GET',
      path: '/' + endpoint,
      options: { auth: false },
      handler: controller.health.bind(controller),
    });
  const available = await s.inject('/healthy');
  assert.strictEqual(available.statusCode, 200);
  assert.deepStrictEqual(available.result, { database: 'ok', status: 'health' });
  const unavailable = await s.inject('/unhealthy');
  assert.strictEqual(unavailable.statusCode, 500);
  assert.deepStrictEqual(unavailable.result, { status: 'unhealth', error: '"database unavailable"' });
  await capture(process.stdout, async () => process.emit('SIGTERM'));
  const shuttingDown = await s.inject('/healthy');
  assert.strictEqual(shuttingDown.statusCode, 500);
  assert.deepStrictEqual(shuttingDown.result, { status: 'shutting down...' });
});
test('response helpers produce the established success and external-error contracts through Hapi', async () => {
  const helpers = require(path.join(root, 'build/core/exception-manager/parser/response.parser'));
  const s = await server();
  for (const [endpoint, run, expected] of [
    ['/one', () => helpers.responseSucess({ id: 1 }, {}, { custom: true }), [{ id: 1 }]],
    ['/array', () => helpers.responseSucess([{ id: 2 }], { query: { limit: 2, offset: 1 } }, {}), [{ id: 2 }]],
    ['/wrapped', () => helpers.responseSucess({ meta: {}, records: [{ id: 3 }] }, { query: {} }, {}), [{ id: 3 }]],
    [
      '/api',
      () => helpers.responseSuccessApi({ meta: { query: { limit: 3 } }, records: [{ id: 4 }] }, {}, {}),
      [{ id: 4 }],
    ],
  ]) {
    route(s, { method: 'GET', path: endpoint, handler: async ({ reply }) => reply.response(run()) });
    const response = await s.inject('/v1' + endpoint);
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.result.records, expected);
    assert.strictEqual(response.result.meta.recordCount, 1);
  }
  const errors = [
    { response: { headers: { 'content-type': 'text/html' } } },
    { response: { headers: { 'content-type': 'application/json' } }, requestApi: { statusCode: 404 } },
    { requestApi: { statusCode: 503 } },
    { requestApi: { statusCode: 404 }, errorCode: 10000 },
    'plain error',
    new Error('internal'),
    { errorCode: 10000 },
    { errorCode: 10000, userMessage: 'User', developerMessage: 'Developer', moreInfo: 'url' },
    { errorCode: 10000, userMessage: 'User' },
    { errorCode: 10000, userMessage: 'User', developerMessage: 'Developer' },
  ];
  for (let index = 0; index < errors.length; index++) {
    route(s, {
      method: 'GET',
      path: '/error-' + index,
      handler: async ({ reply }) => {
        const result = helpers.responseError(errors[index]);
        return reply.response({ body: result[0], headers: result[2] }).code(result[1]);
      },
    });
    const response = await s.inject('/v1/error-' + index);
    assert.strictEqual(response.statusCode, index === 0 ? 400 : index === 1 ? 404 : 500);
    assert.strictEqual(response.result.body.errorCode, index === 0 ? 20090 : index === 1 ? 20023 : 10000);
    if (index === 7) assert.strictEqual(response.result.body.userMessage, 'User');
  }
});
test('error formatting cleans nested JSON and supports configured languages through a controller', async () => {
  const parser = require(path.join(root, 'build/core/exception-manager/parser/apigee-error.parser'));
  const s = await server();
  route(s, {
    method: 'GET',
    handler: async ({ reply }) => {
      const value = {
        empty: '',
        nil: null,
        nested: { empty: [] },
        array: ['', null, {}, [], { retained: 'yes' }],
        zero: 0,
        bool: false,
        date: new Date('2020-01-01T00:00:00Z'),
      };
      parser.clearJson(value);
      const error = parser.errorParser(20007, 'query');
      return reply.response({
        value,
        error,
        trimmed: parser.trim('  retained  '),
        whitespace: parser.isEmptyValue(' '),
        nil: parser.trim(undefined),
      });
    },
  });
  const response = await s.inject('/v1/feature');
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(response.payload).value, {
    array: [{ retained: 'yes' }],
    zero: 0,
    bool: false,
    date: '2020-01-01T00:00:00.000Z',
  });
  assert.strictEqual(response.result.trimmed, 'retained');
  assert.strictEqual(response.result.whitespace, true);
  assert.strictEqual(response.result.nil, '');
  process.env.HAPI_LANGUAGE = 'pt';
  assert.strictEqual((await s.inject('/v1/feature')).statusCode, 200);
  process.env.HAPI_LANGUAGE = 'unknown-language';
  assert.strictEqual((await s.inject('/v1/feature')).statusCode, 200);
  delete process.env.HAPI_LANGUAGE;
  route(s, { method: 'GET', path: '/unknown-code', handler: async () => parser.errorParser(999999, undefined) });
  assert.strictEqual((await s.inject('/v1/unknown-code')).statusCode, 500);
  const catalog = feature('core/exception-manager/apigee/error-catalog.apigee');
  catalog['999998'] = { httpcode: 400, pt: { developerMessage: 'Configured', userMessage: 'Configured' } };
  try {
    route(s, { method: 'GET', path: '/missing-translation', handler: async () => parser.errorParser(999998, []) });
    assert.strictEqual((await s.inject('/v1/missing-translation')).statusCode, 500);
  } finally {
    delete catalog['999998'];
  }
});
test('JWT fallback secrets and real startup timeout options remain compatible', async () => {
  const key = process.env.APP_JWT;
  delete process.env.APP_JWT;
  const s = await server();
  process.env.APP_JWT = key;
  route(s, {
    method: 'GET',
    settings: { auth: 'jwt' },
    handler: async ({ reply }) => reply.response({ authorized: true }),
  });
  assert.strictEqual(
    (await s.inject({ url: '/v1/feature', headers: { authorization: 'Bearer ' + jwt.sign({}, process.env.JWT) } }))
      .statusCode,
    200,
  );
  process.env.TIMEOUT = '0';
  try {
    const app = appFolder();
    const started = await new above.Ignition({ path: app, plugins: [], schemes: [] }).start();
    servers.push(started);
    assert.strictEqual((await started.inject('/health')).statusCode, 200);
  } finally {
    delete process.env.TIMEOUT;
  }
});
test('entrypoints load without a main module and fatal rejections exit the application', async () => {
  const spawnSync = require('child_process').spawnSync;
  const env = Object.assign({}, process.env, { NODE_ENV: 'production', JWT: '', APP_JWT: process.env.APP_JWT });
  const loaded = spawnSync(
    process.execPath,
    ['-e', `const above=require(${JSON.stringify(root)});process.stdout.write(above.Joi.version);`],
    { env, encoding: 'utf8' },
  );
  assert.strictEqual(loaded.status, 0, loaded.stderr);
  assert.ok(loaded.stdout.includes('15.1.1'));
  const app = appFolder();
  const fatal = spawnSync(
    process.execPath,
    [
      '-e',
      `const above=require(${JSON.stringify(root)});new above.Ignition({path:${JSON.stringify(app)}}).start().then(()=>process.emit('unhandledRejection',new Error('fatal integration rejection')));`,
    ],
    { env: Object.assign({}, process.env, { NODE_ENV: 'test' }), encoding: 'utf8' },
  );
  assert.strictEqual(fatal.status, 1, fatal.stderr);
});
test('development diagnostics report unexpected request errors but preserve business exceptions', async () => {
  process.env.NODE_ENV = 'development';
  const app = appFolder();
  try {
    const captured = await capture(process.stdout, () => new above.Ignition({ path: app }).start());
    const s = captured.result;
    servers.push(s);
    class Business extends above.BaseException {
      constructor() {
        super({ developerMessage: 'business diagnostic', errorCode: 123, statusCode: 400, userMessage: 'business' });
      }
    }
    route(s, {
      path: '/diagnostic',
      handler: async () => {
        throw new Error('unexpected diagnostic');
      },
    });
    route(s, {
      path: '/business-diagnostic',
      handler: async () => {
        throw new Business();
      },
    });
    route(s, { path: '/records', settings: { records: true }, handler: async ({ reply }) => reply.response([]) });
    const diagnostics = await capture(process.stderr, async () => {
      assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/diagnostic' })).statusCode, 500);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.ok(diagnostics.output.includes('unexpected diagnostic'));
    const business = await capture(process.stderr, async () => {
      assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/business-diagnostic' })).statusCode, 400);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.strictEqual(business.output, '');
    assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/records' })).result.meta.server, os.hostname());
  } finally {
    process.env.NODE_ENV = 'test';
  }
});
test('legacy validation errors from custom plugins keep their public translations', async () => {
  const Boom = dependency('@hapi/boom');
  const s = await server();
  const cases = [
    ['any.unknown', ['field']],
    ['date.isoDate', ['field']],
    ['object.missing', []],
    ['object.nand', []],
    ['object.xor', []],
    ['any.required', 'field'],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [type, location] = cases[index];
    route(s, {
      method: 'GET',
      path: '/legacy-' + index,
      handler: async () => {
        const error = Boom.badRequest('legacy plugin validation');
        error.details = [{ path: location, type, context: { label: 'value', peers: ['a', 'b'], main: 'a' } }];
        error.output.payload.validation = { source: 'payload' };
        throw error;
      },
    });
    const response = await s.inject('/v1/legacy-' + index);
    assert.strictEqual(response.statusCode, 400);
    assert.ok([20006, 20008, 20042, 20001].includes(response.result.errorCode));
  }
  route(s, {
    method: 'GET',
    path: '/forbidden',
    handler: async () => {
      throw Boom.forbidden('denied');
    },
  });
  assert.strictEqual((await s.inject('/v1/forbidden')).result.errorCode, 20020);
});
test('consumer plugins register before routes and database startup completes', async () => {
  const app = appFolder();
  const order = [];
  const options = {
    path: app,
    cors: false,
    plugins: [
      {
        plugin: {
          name: 'consumer-plugin',
          register: async (s) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            s.route({ method: 'GET', path: '/custom', options: { auth: false }, handler: () => ({ plugin: true }) });
            order.push('plugin');
          },
        },
      },
    ],
    database: {
      authenticate: async () => {
        order.push('database');
      },
    },
  };
  new above.Ignition(options);
  const s = await new above.Ignition(options).start();
  servers.push(s);
  assert.deepStrictEqual(order, ['plugin', 'database']);
  assert.strictEqual((await s.inject('/custom')).statusCode, 200);
});
test('development, stage and production initialize real Hapi listeners and environment-specific plugins', async () => {
  for (const env of ['development', 'stage', 'production']) {
    process.env.NODE_ENV = env;
    const app = appFolder();
    const options = { path: app, schemes: [{ source: {} }], database: {} };
    const captured = await capture(process.stdout, () => new above.Ignition(options).start());
    const s = captured.result;
    servers.push(s);
    assert.ok(s.info.started > 0);
    assert.strictEqual((await s.inject('/health')).statusCode, 200);
    if (env !== 'production') assert.strictEqual((await s.inject('/docs')).statusCode, 200);
    else assert.strictEqual(s.match('get', '/docs'), null);
    assert.ok(captured.output.includes('Server running on'));
    await stopServer(s);
  }
  process.env.NODE_ENV = 'test';
  feature('core/routes-manager').defineSchemes([]);
});
test('logging observes real Hapi request, application and lifecycle events', async () => {
  const captured = await capture(process.stdout, async () => {
    for (const custom of [false, true]) {
      const s = await server();
      s.ext('onRequest', (request, h) => {
        request.log(['info'], 'before-logger-decoration');
        return h.continue;
      });
      const options = {
        enableConsole: true,
        appName: 'consumer-fixture',
        env: 'test',
        versionApi: '1.0.0',
        ignorePaths: ['/ignored'],
      };
      if (custom) {
        options.logChild = () => ({ customChild: true });
        options.logPattern = (_, error) => ({ customPattern: true, failed: Boolean(error) });
      }
      await s.register({ plugin: feature('plugins/log'), options });
      route(s, {
        path: '/logged',
        handler: async ({ request, reply }) => {
          request.additional.log(['info'], 'consumer-request-event');
          s.log(['info'], 'consumer-server-event');
          s.log(['error'], new Error('consumer-server-error'));
          return reply.response({ logged: true });
        },
      });
      route(s, {
        path: '/failure',
        handler: async () => {
          throw new Error('consumer-request-error');
        },
      });
      s.route({ method: 'GET', path: '/ignored', options: { auth: false }, handler: () => ({ ignored: true }) });
      await s.start();
      assert.strictEqual(
        (
          await s.inject({
            method: 'POST',
            url: '/v1/logged',
            payload: { value: 1 },
            headers: { messageid: 'consumer-message' },
          })
        ).statusCode,
        200,
      );
      assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/failure' })).statusCode, 500);
      assert.strictEqual((await s.inject('/ignored')).statusCode, 200);
      assert.strictEqual(s.logger().fields.app, 'consumer-fixture');
      await stopServer(s);
    }
  });
  const lines = captured.output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(lines.some((line) => line.msg === 'request completed'));
  assert.ok(lines.some((line) => line.msg === 'server started'));
  assert.ok(lines.some((line) => line.msg === 'server stopped'));
  assert.ok(lines.some((line) => line.msg === 'request-error'));
  assert.ok(lines.some((line) => line.customPattern === true));
  assert.ok(lines.some((line) => line.trace && line.trace.id === 'consumer-message'));
});
test('logging supports disabled output and explicitly filtered events', async () => {
  const s = await server();
  await s.register({
    plugin: feature('plugins/log'),
    options: { appName: 'disabled', env: 'test', versionApi: '1.0.0' },
  });
  assert.strictEqual(typeof s.logger, 'undefined');
  const captured = await capture(process.stdout, async () => {
    const filtered = await server();
    await filtered.register({
      plugin: feature('plugins/log'),
      options: { appName: 'filtered', env: 'test', versionApi: '1.0.0', enableConsole: true, logEvents: [] },
    });
    route(filtered, {
      handler: async () => {
        throw new Error('filtered error');
      },
    });
    assert.strictEqual((await filtered.inject({ method: 'POST', url: '/v1/feature' })).statusCode, 500);
    await filtered.stop();
  });
  assert.strictEqual(captured.output, '');
});
test('logging tolerates third-party loggers and error events before a response exists', async () => {
  const captured = await capture(process.stdout, async () => {
    const s = await server();
    s.ext('onRequest', (request, h) => {
      if (request.path === '/third-party') request.logger = dependency('abstract-logging');
      return h.continue;
    });
    await s.register({
      plugin: feature('plugins/log'),
      options: { appName: 'early-error', env: 'test', versionApi: '1.0.0', enableConsole: true },
    });
    s.route({ method: 'GET', path: '/third-party', options: { auth: false }, handler: () => ({ thirdParty: true }) });
    route(s, {
      method: 'GET',
      handler: async ({ request, reply }) => {
        request.additional.log(['error'], new Error('early request event'));
        await s.events.emit('request', [
          request.additional,
          { channel: 'internal', tags: [], data: 'internal informational event' },
          {},
        ]);
        await s.events.emit('request', [
          request.additional,
          { channel: 'internal', tags: ['accept-encoding'], data: 'encoding event' },
          { 'accept-encoding': true },
        ]);
        return reply.response({ retained: true });
      },
    });
    assert.strictEqual((await s.inject('/third-party')).statusCode, 200);
    assert.strictEqual((await s.inject('/v1/feature')).statusCode, 200);
    await stopServer(s);
  });
  assert.ok(captured.output.includes('early request event'));
});
test('Logstash transport sends actual JSON records to a local TCP receiver', async () => {
  const net = require('net');
  const sockets = [];
  let received = '';
  const receiver = net.createServer((socket) => {
    sockets.push(socket);
    socket.on('data', (data) => {
      received += data.toString();
    });
  });
  await new Promise((resolve, reject) => {
    receiver.once('error', reject);
    receiver.listen(0, '127.0.0.1', resolve);
  });
  const s = await server();
  try {
    await s.register({
      plugin: feature('plugins/log'),
      options: {
        appName: 'tcp-consumer',
        env: 'test',
        versionApi: '1.0.0',
        host: '127.0.0.1',
        port: String(receiver.address().port),
        bztoken: 'integration-token',
      },
    });
    route(s, { handler: async ({ reply }) => reply.response({ tcp: true }) });
    assert.strictEqual((await s.inject({ method: 'POST', url: '/v1/feature' })).statusCode, 200);
    const deadline = Date.now() + 2000;
    while (!received.includes('request completed') && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(received.includes('request completed'), received);
    const record = received
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((line) => line.message === 'request completed');
    assert.strictEqual(record.app, 'tcp-consumer');
  } finally {
    await stopServer(s);
    if (s.logger)
      for (const transport of s.logger().streams) {
        transport.stream.max_connect_retries = 0;
        if (transport.stream.socket) transport.stream.socket.destroy();
      }
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => receiver.close(resolve));
  }
});
test('bad controllers are reported without preventing healthy controllers from loading', async () => {
  const app = appFolder();
  const api = path.join(app, 'api', 'v1');
  fs.mkdirSync(api, { recursive: true });
  fs.writeFileSync(path.join(api, 'broken.controller.js'), 'throw new Error("invalid consumer controller");');
  fs.writeFileSync(path.join(api, 'ignored.controller.d.ts'), 'invalid javascript declaration');
  fs.writeFileSync(path.join(api, 'ignored.controller.js.map'), 'not a module');
  fs.writeFileSync(path.join(api, 'readme.txt'), 'not a controller');
  const captured = await capture(process.stderr, async () => {
    const s = await new above.Ignition({ path: app }).start();
    servers.push(s);
    assert.strictEqual((await s.inject('/health')).statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.ok(captured.output.includes('invalid consumer controller'));
});
test('formatted console errors can be awaited by a real consumer request', async () => {
  const helpers = require(path.join(root, 'build/helpers'));
  const s = await server();
  route(s, {
    method: 'GET',
    handler: async ({ reply }) => {
      await helpers.consoleError(new Error('consumer-formatting-error'));
      return reply.response({ complete: true });
    },
  });
  const captured = await capture(process.stderr, () => s.inject('/v1/feature'));
  assert.strictEqual(captured.result.statusCode, 200);
  assert.ok(captured.output.includes('consumer-formatting-error'));
});
test('package subpath modules can be loaded by existing consumers', async () => {
  const s = await server();
  route(s, {
    method: 'GET',
    handler: async ({ reply }) => {
      let loaded = 0;
      function visit(folder) {
        for (const entry of fs.readdirSync(folder)) {
          const file = path.join(folder, entry);
          if (fs.statSync(file).isDirectory()) visit(file);
          else if (file.endsWith('.js')) {
            require(file);
            loaded++;
          }
        }
      }
      visit(path.join(root, 'build'));
      return reply.response({ loaded });
    },
  });
  const response = await s.inject('/v1/feature');
  assert.strictEqual(response.statusCode, 200);
  assert.ok(response.result.loaded >= 25);
});
test('Ignition starts an unmodified consumer, discovers controllers and serves Swagger and health', async () => {
  const app = appFolder();
  const api = path.join(app, 'api', 'v1');
  fs.mkdirSync(api, { recursive: true });
  fs.writeFileSync(
    path.join(api, 'consumer.controller.js'),
    `const Above = require(${JSON.stringify(root)}); class Consumer { async get({reply}) { return reply.response({consumer:true}); } } Above.Get('/get', {auth:false})(Consumer.prototype, 'get', Object.getOwnPropertyDescriptor(Consumer.prototype,'get')); module.exports.default=Above.Controller('/consumer')(Consumer);`,
  );
  const s = await new above.Ignition({ path: app }).start();
  servers.push(s);
  for (const endpoint of ['/health', '/health/ping', '/health/check']) {
    const response = await s.inject(endpoint);
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.result, { status: 'pong' });
  }
  const response = await s.inject('/v1/consumer/get');
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.result, { consumer: true });
  assert.strictEqual((await s.inject('/docs')).statusCode, 200);
  const spec = await s.inject('/swagger.json');
  assert.strictEqual(spec.statusCode, 200);
  assert.strictEqual(spec.result.info.title, 'consumer-fixture');
  assert.ok(spec.result.paths['/v1/consumer/get']);
  const redirect = await s.inject('/');
  assert.strictEqual(redirect.statusCode, 302);
  assert.strictEqual(redirect.headers.location, '/docs');
});
async function run() {
  let failures = 0;
  const selected = tests.filter(
    (item) => !process.env.ABOVE_TEST_FILTER || new RegExp(process.env.ABOVE_TEST_FILTER).test(item.name),
  );
  const watchdog = setTimeout(() => {
    console.error('Integration suite did not complete');
    process.exit(1);
  }, 120000);
  try {
    for (const item of selected) {
      const before = {
        SIGTERM: process.listeners('SIGTERM'),
        unhandledRejection: process.listeners('unhandledRejection'),
      };
      const serverStart = servers.length;
      try {
        await item.run();
        console.log('ok - ' + item.name);
      } catch (error) {
        failures++;
        console.error('not ok - ' + item.name);
        console.error(error.stack);
      } finally {
        for (const s of servers.slice(serverStart)) await stopServer(s);
        for (const name of Object.keys(before))
          for (const listener of process.listeners(name))
            if (!before[name].includes(listener)) process.removeListener(name, listener);
      }
    }
  } finally {
    for (const s of servers) await stopServer(s);
    for (const folder of folders) removeFolder(folder);
    clearTimeout(watchdog);
  }
  console.log(`${selected.length - failures}/${selected.length} integration tests passed on ${process.version}`);
  if (!selected.length || failures) process.exitCode = 1;
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
