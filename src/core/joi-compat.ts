import Joi from 'joi';
import LegacyJoi from '@hapi/joi';

/** Keep validation in the schema's original Joi instance, including consumer extensions. */
export function schemaRoot(schema: any, seen = new Set<any>()): any {
  if (LegacyJoi.isRef(schema)) return LegacyJoi;
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return undefined;
  seen.add(schema);
  if (schema.isJoi) return schema._currentJoi;
  if (schema.$_root) return schema.$_root;
  for (const key of Object.keys(schema)) {
    const root = schemaRoot(schema[key], seen);
    if (root) return root;
  }
  return undefined;
}

const validator = {
  compile(schema: any): any {
    return (schemaRoot(schema) || Joi).compile(schema);
  },
};

export default validator;
