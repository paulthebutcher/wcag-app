import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';

export function hostedMode(app: FastifyInstance, root: string) {
  const operator = process.env.APP_OPERATOR_AUTH;
  if (operator !== undefined && !/^[^:]+:.{16,}$/.test(operator))
    throw new Error(
      'APP_OPERATOR_AUTH requires a username and a password of at least 16 characters.',
    );
  const digest = (value: Buffer) => createHash('sha256').update(value).digest();
  const expected = operator ? digest(Buffer.from(operator)) : undefined;
  const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  const configuredOrigin = process.env.WEB_ORIGIN ?? (publicDomain && `https://${publicDomain}`);
  const origin = configuredOrigin ? new URL(configuredOrigin) : undefined;
  if (origin && (origin.protocol !== 'https:' || origin.origin !== configuredOrigin))
    throw new Error('Hosted WEB_ORIGIN must be an HTTPS origin without a trailing slash.');

  const hosts = new Set([
    ...(origin ? [origin.hostname] : []),
    ...(process.env.TRUSTED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
  const dist = join(root, 'apps', 'web', 'dist');
  const index = readFileSync(join(dist, 'index.html'));

  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const path = req.url.split('?')[0];
    const healthcheck = path === '/api/health' && ['GET', 'HEAD'].includes(req.method);
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (!hosts.has(host) && !(healthcheck && host === 'healthcheck.railway.app'))
      return reply.code(403).send({ error: { message: 'Untrusted host' } });
    if (req.headers.origin && req.headers.origin !== origin?.origin)
      return reply.code(403).send({ error: { message: 'Untrusted origin' } });
    if (!expected || healthcheck) return;
    const encoded = req.headers.authorization?.match(/^Basic ([A-Za-z0-9+/]+=*)$/i)?.[1];
    if (!encoded || !timingSafeEqual(digest(Buffer.from(encoded, 'base64')), expected))
      return reply
        .header('WWW-Authenticate', 'Basic realm="WCAG Workspace", charset="UTF-8"')
        .code(401)
        .send({ error: { message: 'Sign in to WCAG Workspace' } });
  });

  app.get<{ Params: { filename: string } }>('/assets/:filename', async (req, reply) => {
    const { filename } = req.params;
    const ext = extname(filename);
    const type =
      ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css' : undefined;
    if (!type || !/^[\w-]+\.(js|css)$/.test(filename))
      return reply.code(404).send({ error: { message: 'Asset not found' } });
    const path = join(dist, 'assets', filename);
    if (!existsSync(path)) return reply.code(404).send({ error: { message: 'Asset not found' } });
    return reply.type(type).send(createReadStream(path));
  });
  app.get<{ Params: { '*': string } }>('/*', async (req, reply) => {
    const segment = req.params['*'].split('/')[0];
    if (segment === 'api' || segment === 'assets')
      return reply.code(404).send({ error: { message: 'Route not found' } });
    return reply.type('text/html; charset=utf-8').send(index);
  });
}
