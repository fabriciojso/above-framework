import { RouteOptions, Util, ResponseToolkit, ResponseObject, Request, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';

import { HttpContract } from '../contracts/http.contract';
import { SchemaContract } from '../contracts/application.contract';
import {
  CompatibleValidation,
  CompatibleResponse,
  CompatibleSchema,
  ValidationKey,
} from '../contracts/validation.contract';
import { schemaRoot } from './joi-compat';

export interface RouteOptionsContract extends Omit<RouteOptions, 'validate' | 'response'> {
  validate?: CompatibleValidation;
  response?: CompatibleResponse;
  records?: boolean;
  paginate?: boolean;
  middleware?: Array<(req: Request, h: ResponseToolkit) => Promise<ResponseObject | symbol>>;
}

export interface RoutesManagerContract {
  method: Util.HTTP_METHODS;
  pathname: string;
  descriptor: TypedPropertyDescriptor<(http: HttpContract) => Promise<any>>;
}

class RoutesManager {
  protected static schemes: SchemaContract[] = [];

  public static defineSchemes = (schemes: SchemaContract[]) => {
    RoutesManager.schemes = schemes;
  };

  constructor(
    private options: RoutesManagerContract,
    private routeOptions: RouteOptionsContract,
  ) {}

  public get() {
    const { method, pathname, descriptor } = this.options;
    this.setFailActionIgnore();
    const route = (baseRoute: string): ServerRoute => {
      const path = `${baseRoute}${pathname === '/' ? '' : pathname}`;
      const matchedSchemes = RoutesManager.schemes.filter(
        (schema) => (!schema.include || schema.include.test(path)) && (!schema.exclude || !schema.exclude.test(path)),
      );
      const matching = matchedSchemes.find((schema) => schema.source.query);
      this.setSchemaForPaginate(matching && matching.source.query);
      this.applySchemes(matchedSchemes);

      return {
        method: method === 'HEAD' ? 'GET' : method,
        path,
        handler: async (req: Request, reply: ResponseToolkit) => {
          // Hapi registers HEAD automatically for GET routes and rejects explicit HEAD routes.
          if (method === 'HEAD' && req.raw.req.method !== 'HEAD') {
            return reply.response().code(404);
          }
          let paginate = {
            offset: 0,
            limit: 50,
          };
          if (this.routeOptions.paginate) {
            paginate = {
              offset: Number(req.query.offset),
              limit: Number(req.query.limit),
            };
          }
          if (descriptor.value) {
            if (this.routeOptions.middleware && this.routeOptions.middleware.length > 0) {
              for (const middleware of this.routeOptions.middleware) {
                const responseMiddleware = await middleware(req, reply);
                if (responseMiddleware !== reply.continue) {
                  return responseMiddleware;
                }
              }
            }
            const response = await descriptor.value({
              request: Object.assign(Object.create(Object.getPrototypeOf(req)), req, {
                paginate: {
                  ...paginate,
                },
                additional: req,
              }),
              reply,
            });

            if (this.routeOptions.records) {
              const { source } = response;
              const records = source instanceof Array ? source : [source];
              response.source = {
                meta: {
                  server: process.env.NODE_ENV === 'test' ? 'machine.testing.local' : require('os').hostname(),
                  ...paginate,
                  recordCount: records.length,
                },
                records,
              };
            }
            return response;
          }
          return reply.continue;
        },

        options: {
          auth: 'jwt',
          tags: ['api'],
          ...this.routeOptions,
          validate: {
            ...this.routeOptions.validate,
            options: {
              allowUnknown: true,
            },
          },
          middleware: undefined,
          records: undefined,
          paginate: undefined,
        },
      } as ServerRoute;
    };

    return route;
  }

  private setSchemaForPaginate(globalQuery?: CompatibleSchema) {
    if (this.routeOptions.paginate) {
      const factory =
        schemaRoot(this.routeOptions.validate && this.routeOptions.validate.query) || schemaRoot(globalQuery) || Joi;
      this.setSchemeInByKey('query', {
        limit: factory.number().default(50),
        offset: factory.number().default(0),
      });
    }
  }

  private applySchemes(schemes: SchemaContract[]) {
    schemes.forEach((schema) => {
      if (schema.source.query) {
        this.setSchemeInByKey('query', schema.source.query);
      }
      if (schema.source.headers) {
        this.setSchemeInByKey('headers', schema.source.headers);
      }
      if (schema.source.params) {
        this.setSchemeInByKey('params', schema.source.params);
      }
      if (schema.source.payload) {
        this.setSchemeInByKey('payload', schema.source.payload);
      }
    });
  }

  private setSchemeInByKey(key: ValidationKey, source: CompatibleSchema) {
    if (!this.routeOptions.validate || (this.routeOptions.validate && !this.routeOptions.validate[key])) {
      this.routeOptions.validate = {
        ...this.routeOptions.validate,
        [key]: source,
      };
    } else {
      const validate = this.routeOptions.validate[key];
      // @ts-ignore
      if (validate && validate.append) {
        this.routeOptions.validate = {
          ...this.routeOptions.validate,
          // @ts-ignore
          [key]: validate.append(source),
        };
      }
    }
  }

  private setFailActionIgnore() {
    if (this.routeOptions && this.routeOptions.response) {
      this.routeOptions = {
        ...this.routeOptions,
        response: {
          ...this.routeOptions.response,
          failAction: 'ignore',
        },
      };
    }
  }
}

export default RoutesManager;
