/** Type-only Joi 17 inference. Imported by the public HTTP contract. */
import Joi from 'joi';
import LegacyJoi from '@hapi/joi';
import './joi-legacy-inference';

export type MappedSchema = Joi.SchemaLike | LegacyJoi.mappedSchema;
interface Box<T, R extends boolean> {
  readonly __aboveSchema: { value: T; required: R };
}
type RequiredKeys<T> = {
  [K in keyof T]-?: T[K] extends Box<unknown, true>
    ? K
    : T[K] extends LegacyJoi.BoxedPrimitive<infer B>
      ? B['R'] extends true
        ? K
        : never
      : never;
}[keyof T];
type ExtractMap<T> = { [K in RequiredKeys<T>]: ExtractType<T[K]> } & {
  [K in Exclude<keyof T, RequiredKeys<T>>]?: ExtractType<T[K]>;
};
export type ExtractType<T> =
  T extends Box<infer V, boolean>
    ? V
    : T extends LegacyJoi.BoxedPrimitive
      ? LegacyJoi.extractType<T>
      : T extends readonly (infer V)[]
        ? ExtractType<V>
        : T extends Joi.AnySchema<infer V>
          ? V
          : T extends Record<string, unknown>
            ? ExtractMap<T>
            : T;
type Literal = string | number | boolean | null | undefined;
type Branches<T> = T extends { then: infer A; otherwise: infer B }
  ? ExtractType<A> | ExtractType<B>
  : T extends { then: infer A }
    ? ExtractType<A>
    : T extends { otherwise: infer B }
      ? ExtractType<B>
      : never;

export interface InferredAny<T = any, R extends boolean = false> extends Joi.AnySchema<T>, Box<T, R> {
  required(): InferredAny<T, true>;
  required(): this;
  exist(): InferredAny<T, true>;
  exist(): this;
  optional(): InferredAny<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredAny<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredAny<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredString<T = string, R extends boolean = false> extends Joi.StringSchema<T>, Box<T, R> {
  required(): InferredString<T, true>;
  required(): this;
  exist(): InferredString<T, true>;
  exist(): this;
  optional(): InferredString<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredString<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredString<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredNumber<T = number, R extends boolean = false> extends Joi.NumberSchema<T>, Box<T, R> {
  required(): InferredNumber<T, true>;
  required(): this;
  exist(): InferredNumber<T, true>;
  exist(): this;
  optional(): InferredNumber<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredNumber<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredNumber<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredBoolean<T = boolean, R extends boolean = false> extends Joi.BooleanSchema<T>, Box<T, R> {
  required(): InferredBoolean<T, true>;
  required(): this;
  exist(): InferredBoolean<T, true>;
  exist(): this;
  optional(): InferredBoolean<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredBoolean<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredBoolean<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredDate<T = Date, R extends boolean = false> extends Joi.DateSchema<T>, Box<T, R> {
  required(): InferredDate<T, true>;
  required(): this;
  exist(): InferredDate<T, true>;
  exist(): this;
  optional(): InferredDate<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredDate<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredDate<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredFunction<T = Function, R extends boolean = false> extends Joi.FunctionSchema<T>, Box<T, R> {
  required(): InferredFunction<T, true>;
  required(): this;
  exist(): InferredFunction<T, true>;
  exist(): this;
  optional(): InferredFunction<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredFunction<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredFunction<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredSymbol<T = symbol, R extends boolean = false> extends Joi.SymbolSchema<T>, Box<T, R> {
  required(): InferredSymbol<T, true>;
  required(): this;
  exist(): InferredSymbol<T, true>;
  exist(): this;
  optional(): InferredSymbol<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredSymbol<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredSymbol<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredBinary<T = Buffer, R extends boolean = false> extends Joi.BinarySchema<T>, Box<T, R> {
  required(): InferredBinary<T, true>;
  required(): this;
  exist(): InferredBinary<T, true>;
  exist(): this;
  optional(): InferredBinary<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredBinary<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredBinary<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
}

export interface InferredArray<T = any[], R extends boolean = false> extends Joi.ArraySchema<T>, Box<T, R> {
  required(): InferredArray<T, true>;
  required(): this;
  exist(): InferredArray<T, true>;
  exist(): this;
  optional(): InferredArray<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredArray<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredArray<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
  items<S extends Joi.SchemaLike[]>(...schemas: S): InferredArray<ExtractType<S[number]>[], R>;
  items(...schemas: Joi.SchemaLike[]): this;
}

export interface InferredObject<T = any, R extends boolean = false> extends Joi.ObjectSchema<T>, Box<T, R> {
  required(): InferredObject<T, true>;
  required(): this;
  exist(): InferredObject<T, true>;
  exist(): this;
  optional(): InferredObject<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredObject<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredObject<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
  keys<S extends Record<string, unknown>>(schema: S): InferredObject<T & ExtractMap<S>, R>;
  keys(schema?: Joi.SchemaMap): this;
  append<S extends Record<string, Joi.SchemaLike>>(schema: S): InferredObject<T & ExtractMap<S>, R>;
  append(schema?: Joi.SchemaMap): this;
}

export interface InferredAlternatives<T = any, R extends boolean = false> extends Joi.AlternativesSchema<T>, Box<T, R> {
  required(): InferredAlternatives<T, true>;
  required(): this;
  exist(): InferredAlternatives<T, true>;
  exist(): this;
  optional(): InferredAlternatives<T, false>;
  optional(): this;
  allow<V extends Literal>(...values: V[]): InferredAlternatives<T | V, R>;
  allow(...values: any[]): this;
  valid<V extends Literal>(...values: V[]): InferredAlternatives<V, R>;
  valid(...values: any[]): this;
  default(value?: Parameters<Joi.AnySchema['default']>[0]): this;
  try<S extends Joi.SchemaLike[]>(...schemas: S): InferredAlternatives<ExtractType<S[number]>, R>;
  try(...schemas: Joi.SchemaLike[]): this;
  when<C, S extends { then?: unknown; otherwise?: unknown }>(
    condition: C,
    options: S,
  ): InferredAlternatives<Branches<S>, R>;
  when(condition: string | Joi.Reference | Joi.Schema, options: Joi.WhenOptions | Joi.WhenOptions[]): this;
}

declare module 'joi' {
  type mappedSchema = MappedSchema;
  type extractType<S> = ExtractType<S>;
  interface Root {
    any(): InferredAny<any>;
    any<T extends any = any>(): InferredAny<T>;
    string(): InferredString<string>;
    string<T extends string = string>(): InferredString<T>;
    number(): InferredNumber<number>;
    number<T extends number = number>(): InferredNumber<T>;
    boolean(): InferredBoolean<boolean>;
    boolean<T extends boolean = boolean>(): InferredBoolean<T>;
    date(): InferredDate<Date>;
    date<T extends Date = Date>(): InferredDate<T>;
    func(): InferredFunction<Function>;
    func<T extends Function = Function>(): InferredFunction<T>;
    symbol(): InferredSymbol<symbol>;
    symbol<T extends symbol = symbol>(): InferredSymbol<T>;
    binary(): InferredBinary<Buffer>;
    binary<T extends Buffer = Buffer>(): InferredBinary<T>;
    object<S extends Record<string, Joi.SchemaLike>>(schema: S): InferredObject<ExtractMap<S>>;
    object(): InferredObject<{}>;
    array(): InferredArray<never[]>;
    alternatives<S extends Joi.SchemaLike[]>(...schemas: S): InferredAlternatives<ExtractType<S[number]>>;
    alt<S extends Joi.SchemaLike[]>(...schemas: S): InferredAlternatives<ExtractType<S[number]>>;
  }
}
