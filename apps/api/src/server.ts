import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { createRoutes } from './routes';
export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'connect-src': ["'self'"], 'img-src': ["'self'", 'data:'] } } }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_request, response) => response.json({ status: 'ok', liveSharingEnabled: process.env.SHARING_MODE === 'live-test' }));
app.use('/api', createRoutes());
app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error instanceof SyntaxError ? 400 : 500).json({ error: 'Request could not be processed.' });
});
app.use(express.static(fileURLToPath(new URL('../../web/dist', import.meta.url))));
app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1', () => console.info('Portal API: http://127.0.0.1:3001'));