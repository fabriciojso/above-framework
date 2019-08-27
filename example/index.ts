import { Ignition } from '../src/index';
import Joi from '@hapi/joi';

const ignition = new Ignition({
  path: __dirname,
  schemes: [
    {
      include: /(.*payment.*)/,
      exclude: /(.*get.*)/,
      source: {
        headers: Joi.object({
          'application-name': Joi.string().required(),
        }),
      },
    },
  ],
});

ignition.start();
