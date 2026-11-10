import { Request, Server } from '@hapi/hapi';
import NullLogger from 'abstract-logging';
import Bunyan from 'bunyan';
import BunyanTCP from 'bunyan-logstash-tcp-fork';

interface LogstashOptionsContract {
  host?: string;
  port?: string;
  appName: string;
  bztoken?: string;
  env: string;
  enableConsole?: boolean;
  versionApi: string;
  ignorePaths?: string[];
  /**
   * Padrão de payload de saída
   */
  logChild?: (request: any) => {};

  /**
   * Padrão de payload de entrada
   */
  logPattern?: (request: any, error: any) => {};
  logEvents?: string[];
}

const Log = {
  name: 'logstash',
  version: '1.0',
  register: (server: Server, options: LogstashOptionsContract) => {
    const { host, port, appName, env, bztoken, versionApi, ignorePaths, logChild, logPattern, enableConsole } = options;
    if (!enableConsole && !(host && port && bztoken && appName)) return;
    const streams: Bunyan.Stream[] = [];
    if (enableConsole) streams.push({ level: 'debug', stream: process.stdout });
    if (host && port && bztoken && appName) {
      streams.push({ level: 'debug', type: 'raw', stream: BunyanTCP.createStream({ host, port, appName }) });
    }
    const { err, req, res } = Bunyan.stdSerializers;
    const logger = Bunyan.createLogger({
      name: appName,
      app: appName,
      env,
      serializers: { err, req, res },
      streams,
      bztoken,
      type: 'json',
      version: versionApi,
    });
    const events = new Set(options.logEvents || ['onPostStart', 'onPostStop', 'response', 'request-error']);
    const ignored = new Set(ignorePaths || []);
    const isIgnored = (request: Request) => ignored.has(request.url.pathname);
    const requestLogger = (request: any) => {
      if (!request.logger) request.logger = logger.child(logChild ? logChild(request) : logChildDefault(request));
      return request.logger;
    };
    const pattern = (request: any, error: any) =>
      logPattern ? logPattern(request, error) : logPatternDefault(request, error);
    const logEvent = (current: Bunyan, event: any) => current.info({ tags: event.tags, data: event.data });

    server.decorate('server', 'logger', () => logger);
    server.ext('onRequest', async (request: any, h) => {
      request.logger = isIgnored(request) ? NullLogger : requestLogger(request);
      return h.continue;
    });
    server.events.on('log', (event: any) => {
      if (event.error) logger.warn({ err: event.error });
      else logEvent(logger, event);
    });
    server.events.on('request', (request: any, event, tags) => {
      if (isIgnored(request) || (event.channel === 'internal' && !event.error && !tags['accept-encoding'])) return;
      const current = requestLogger(request);
      if (event.error && events.has('request-error')) current.warn(pattern(request, event.error), 'request-error');
      else if (event.channel === 'app') logEvent(current, event);
    });
    if (events.has('response')) {
      server.events.on('response', (request: any) => {
        if (!isIgnored(request)) requestLogger(request).info(pattern(request, null), 'request completed');
      });
    }
    if (events.has('onPostStart'))
      server.ext('onPostStart', async () => {
        logger.info(server.info, 'server started');
      });
    if (events.has('onPostStop'))
      server.ext('onPostStop', async () => {
        logger.info(server.info, 'server stopped');
      });

    function logChildDefault(request: Request) {
      return {
        trace: { id: request.headers.messageid || request.info.id },
        http: {
          uri: request.url.pathname,
          path: request.url.pathname,
          url: `${request.headers.host}${request.url.pathname}`,
          protocol: request.url.protocol,
          host: request.headers.host,
          user_agent: request.headers['user-agent'],
          request_body: JSON.stringify(request.payload),
          request_header: JSON.stringify(request.headers),
          request_method: request.method,
          request_authorization: request.auth.credentials,
        },
        peer: { service: appName },
      };
    }
    function logPatternDefault(request: any, error: any) {
      const fields = request.logger.fields || {};
      const response = request.response || {};
      const payload = response._payload || {};
      return {
        kind: 'request',
        http: {
          ...fields.http,
          latency_seconds: (request.info.responded - request.info.received) / 1000.0,
          response_body: payload._data,
          response_header: JSON.stringify(response.headers),
          status_code: Number(request.raw.res.statusCode),
          request_body: JSON.stringify(request.payload),
        },
        peer: { ...fields.peer, hostname: fields.hostname },
        err: error,
      };
    }
  },
};

export default Log;
