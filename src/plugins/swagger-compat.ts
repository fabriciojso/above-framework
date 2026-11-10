import Joi from 'joi';
import LegacyJoi from '@hapi/joi';
import hapiSwagger from 'hapi-swagger';
import { Server, Request } from '@hapi/hapi';

const documentationCache = new WeakMap<object, any>();
const schemaTypes = new Set([
  'any',
  'string',
  'number',
  'boolean',
  'date',
  'binary',
  'array',
  'object',
  'alternatives',
  'symbol',
  'function',
]);
const documentedRules = new Set([
  'min',
  'max',
  'greater',
  'less',
  'length',
  'precision',
  'multiple',
  'integer',
  'positive',
  'negative',
  'port',
  'alphanum',
  'token',
  'email',
  'uri',
  'guid',
  'hostname',
  'regex',
]);

/** Translate descriptions for Swagger only. Actual validation always uses the original Joi schema. */
function fromDescription(description: any, original: any): any {
  const factory = (Joi as any)[description.type];
  let schema = schemaTypes.has(description.type) ? factory.call(Joi) : Joi.any();
  if (description.children) {
    const keys: Record<string, any> = {};
    Object.keys(description.children).forEach((key) => {
      keys[key] = fromDescription(
        description.children[key],
        original._inner.children.find((child: any) => child.key === key).schema,
      );
    });
    schema = schema.keys(keys);
  }
  if (description.items)
    schema = schema.items(
      ...description.items.map((item: any, index: number) => fromDescription(item, original._inner.items[index])),
    );
  if (description.alternatives) {
    const choices: any[] = [];
    description.alternatives.forEach((choice: any, index: number) => {
      const match = original._inner.matches[index];
      if (choice.type) choices.push(fromDescription(choice, match.schema));
      else {
        if (choice.then) choices.push(fromDescription(choice.then, match.then));
        if (choice.otherwise) choices.push(fromDescription(choice.otherwise, match.otherwise));
      }
    });
    schema = schema.try(...choices);
  }
  const flags = description.flags || {};
  if (flags.presence) schema = schema.presence(flags.presence);
  if (Object.prototype.hasOwnProperty.call(flags, 'default')) schema = schema.default(flags.default);
  if (description.label) schema = schema.label(description.label);
  if (description.valids)
    schema = flags.allowOnly ? schema.valid(...description.valids) : schema.allow(...description.valids);
  for (const rule of description.rules || []) {
    if (!documentedRules.has(rule.name)) continue;
    if (rule.name === 'regex') schema = schema.pattern(rule.arg.pattern, rule.arg.options);
    else {
      const sourceRule = original._tests.find((test: any) => test.name === rule.name);
      if (LegacyJoi.isRef(sourceRule.arg)) {
        const manifest = schema.describe();
        schema = Joi.build({
          ...manifest,
          rules: [
            ...(manifest.rules || []),
            {
              name: rule.name,
              args: {
                limit: { ref: { path: sourceRule.arg.path, type: sourceRule.arg.isContext ? 'global' : 'value' } },
              },
            },
          ],
        });
      } else schema = schema[rule.name](rule.arg);
    }
  }
  if (description.description) schema = schema.description(description.description);
  for (const meta of description.meta || []) schema = schema.meta(meta);
  for (const example of description.examples || []) schema = schema.example(example.value);
  if (description.notes) schema = schema.note(...description.notes);
  if (description.tags) schema = schema.tag(...description.tags);
  if (description.unit) schema = schema.unit(description.unit);
  return schema;
}

function documentSchema(schema: any): any {
  if (!schema || !schema.isJoi) return schema;
  const cached = documentationCache.get(schema);
  if (cached) return cached;
  const converted = fromDescription(schema.describe(), schema);
  documentationCache.set(schema, converted);
  return converted;
}

function documentationRequest(request: Request): Request {
  const server = new Proxy(request.server, {
    get(target, key) {
      if (key === 'table')
        return () =>
          target.table().map((route) => {
            const settings: any = { ...route.settings };
            // Hapi's route table always contains normalized validation and response settings.
            settings.validate = { ...settings.validate };
            for (const source of ['headers', 'params', 'query', 'payload', 'state'])
              settings.validate[source] = documentSchema(settings.validate[source]);
            settings.response = {
              ...settings.response,
              schema: documentSchema(settings.response.schema),
              status: { ...settings.response.status },
            };
            for (const status of Object.keys(settings.response.status))
              settings.response.status[status] = documentSchema(settings.response.status[status]);
            return { ...route, settings };
          });
      return Reflect.get(target, key, target);
    },
  });
  return new Proxy(request, { get: (target, key) => (key === 'server' ? server : Reflect.get(target, key, target)) });
}

const original = hapiSwagger.plugin;
const SwaggerCompat = {
  ...original,
  register(server: Server, options: any) {
    const facade = new Proxy(server, {
      get(target, key) {
        if (key === 'route')
          return (routes: any[]) =>
            target.route(
              routes.map((route) => {
                const handler = route.options.handler;
                return {
                  ...route,
                  options: {
                    ...route.options,
                    handler: (request: Request, h: any) => handler(documentationRequest(request), h),
                  },
                };
              }),
            );
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return original.register(facade, options);
  },
};

export default SwaggerCompat;
