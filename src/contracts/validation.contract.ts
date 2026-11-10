import { RouteOptionsValidate, RouteOptionsResponse } from '@hapi/hapi';
import Joi from 'joi';
import LegacyJoi from '@hapi/joi';

export type CompatibleSchema = Joi.SchemaLike | LegacyJoi.SchemaLike | ((...args: any[]) => any) | boolean | null;
export type ValidationKey = 'headers' | 'params' | 'query' | 'payload' | 'state';
export type CompatibleValidation = Omit<RouteOptionsValidate, ValidationKey> &
  Partial<Record<ValidationKey, CompatibleSchema>>;
export type CompatibleResponse = Omit<RouteOptionsResponse, 'schema' | 'status'> & {
  schema?: CompatibleSchema;
  status?: Record<number, CompatibleSchema>;
};
