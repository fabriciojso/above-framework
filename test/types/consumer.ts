import { Joi, IHttp, HttpContract, Controller, Post } from 'above-framework';
import AliasJoi from '@hapi/joi';
import CanonicalJoi from 'joi';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

const validate = {
  payload: Joi.object({
    name: Joi.string().min(1).required(),
    age: Joi.number().integer(),
    enabled: Joi.boolean().default(true),
    nested: Joi.object({ id: Joi.number().required() }).required(),
    items: Joi.array().items(Joi.string().required()).required(),
    choice: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    nullable: Joi.string().allow(null).required(),
    literal: Joi.string().valid('one', 'two').required(),
    chained: Joi.object().keys({ first: Joi.string().required() }).append({ second: Joi.number() }).required(),
    maybe: Joi.string().required().optional(),
    conditional: Joi.alternatives().when('enabled', { then: Joi.number(), otherwise: Joi.string() }),
  }).required(),
  query: Joi.object({ limit: Joi.number().default(50) }),
};

type Payload = IHttp<typeof validate>['request']['payload'];
export type Name = Assert<Equal<Payload['name'], string>>;
export type NotAny = Assert<Equal<IsAny<Payload>, false>>;
export type Age = Assert<Equal<Payload['age'], number | undefined>>;
export type Id = Assert<Equal<Payload['nested']['id'], number>>;
export type Items = Assert<Equal<Payload['items'], string[]>>;
export type Choice = Assert<Equal<Payload['choice'], string | number>>;
export type Nullable = Assert<Equal<Payload['nullable'], string | null>>;
export type Literal = Assert<Equal<Payload['literal'], 'one' | 'two'>>;
export type First = Assert<Equal<Payload['chained']['first'], string>>;
export type Second = Assert<Equal<Payload['chained']['second'], number | undefined>>;
export type Maybe = Assert<Equal<Payload['maybe'], string | undefined>>;
export type Conditional = Assert<Equal<Payload['conditional'], string | number | undefined>>;

export const alias = { payload: AliasJoi.object({ id: AliasJoi.number().required() }).required() };
const canonical = { payload: CanonicalJoi.object({ id: CanonicalJoi.number().required() }).required() };
export type Alias = Assert<Equal<IHttp<typeof alias>['request']['payload']['id'], number>>;
export type Canonical = Assert<Equal<IHttp<typeof canonical>['request']['payload']['id'], number>>;
export type Extract = Assert<Equal<Joi.extractType<typeof alias>['payload']['id'], number>>;
export function useHttpAlias(http: HttpContract<typeof validate>): IHttp<typeof validate> {
  return http;
}

@Controller('/consumer')
export class UnchangedConsumer {
  @Post('/legacy', { auth: false, validate })
  async legacy({ request, reply }: IHttp<typeof validate>) {
    return reply.response({ name: request.payload.name });
  }

  @Post('/modern', { auth: false, validate: canonical })
  async modern({ request, reply }: IHttp<typeof canonical>) {
    return reply.response({ id: request.payload.id });
  }
}

export function handler({ request, reply }: IHttp<typeof validate>) {
  const name: string = request.payload.name;
  // @ts-expect-error the schema guarantees a string, never a number or any
  const wrong: number = request.payload.name;
  // @ts-expect-error missing properties must not become any
  request.payload.doesNotExist;
  return reply.response({ name, wrong, limit: request.paginate.limit });
}
