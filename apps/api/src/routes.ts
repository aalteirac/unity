import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { accountInputSchema, deliveryInputSchema, sessionInputSchema } from '@portal/contracts';
import { createSession, getSession, identities, previewFor } from './identity';
import { normalizeAccount } from './lib/accountIdentifier';
import { NativeAppListingDistributor } from './modules/native-app/NativeAppListingDistributor';
import { UnityDataListingDistributor } from './modules/data-sharing/UnityDataListingDistributor';
import { JobStore } from './services/JobStore';
import { OnboardingService } from './services/OnboardingService';
import { fileURLToPath } from 'node:url';
import { connectionFromToml, createTomlExecutor, type SqlExecutor } from './lib/snowflake';
// Fails at startup unless every live-test setting is explicit. Live-test creates draft private listings targeting the entered account.
export function liveTestSettings(env: NodeJS.ProcessEnv = process.env) {
  const { SNOWFLAKE_CONNECTION_NAME: connection, SNOWFLAKE_ROLE: role, SNOWFLAKE_WAREHOUSE: warehouse } = env;
  if (!connection || !role || !warehouse) throw new Error('Live-test mode requires SNOWFLAKE_CONNECTION_NAME, SNOWFLAKE_ROLE and SNOWFLAKE_WAREHOUSE.');
  const terms = (env.LISTING_TERMS ?? 'STANDARD').toUpperCase();
  if (terms !== 'OFFLINE' && terms !== 'STANDARD') throw new Error('LISTING_TERMS must be OFFLINE or STANDARD.');
  return { connection, role, warehouse, terms: terms as 'OFFLINE' | 'STANDARD' };
}
export function createRoutes(storePath = fileURLToPath(new URL('../../../.local/jobs.json', import.meta.url)), liveExecutor?: SqlExecutor) {
  const router = Router();
  const configuredMode = process.env.SHARING_MODE ?? 'mock';
  if (!['mock', 'dry-run', 'live-test'].includes(configuredMode)) throw new Error('This portal supports mock, dry-run or live-test mode only.');
  const mode = configuredMode as 'mock' | 'dry-run' | 'live-test';
  const live = mode === 'live-test' ? liveTestSettings() : undefined;
  const noExecution = { execute: async () => { throw new Error('Dry-run cannot execute SQL.'); } };
  const executor = live ? liveExecutor ?? createTomlExecutor(() => connectionFromToml(live.connection, live.role, live.warehouse)) : noExecution;
  const config = { namespace: process.env.PROVIDER_NAMESPACE ?? 'UNITY_PORTAL', ...(live ? { providerRole: live.role, terms: live.terms, draftOnly: true, profile: process.env.LISTING_PROFILE || undefined, documentationUrl: process.env.LISTING_DOCUMENTATION_URL || undefined } : {}) };
  const nativeApp = new NativeAppListingDistributor({ ...config, applicationPackage: process.env.NATIVE_APP_PACKAGE ?? 'UNITY_ANALYTICS_PACKAGE' }, executor);
  const data = new UnityDataListingDistributor({ ...config, source: process.env.DATA_SOURCE ?? 'UNITY_DATA.PUBLIC.EVENTS', unityIdColumn: process.env.DATA_UNITY_ID_COLUMN ?? 'UNITY_ID', columns: (process.env.DATA_OUTPUT_COLUMNS ?? 'PROJECT_NAME,EVENT_DATE,ACTIVE_PLAYERS,REVENUE_USD').split(',').map(value => value.trim()), destinationSchema: process.env.DATA_DESTINATION_SCHEMA ?? 'UNITY_DATA.PORTAL_SHARING' }, executor);
  const service = new OnboardingService(new JobStore(storePath), mode, undefined, live ? { distributors: { nativeApp, data } } : undefined);
  const safe: (handler: RequestHandler) => RequestHandler = handler => async (request, response, next) => {
    try { await handler(request, response, next); }
    catch (error) {
      const validation = error instanceof z.ZodError;
      const message = error instanceof Error && /^(A locator|Enter |Use |The account|Select a demo|Delivery not found|Source and sharing|Invalid configured|Data source configuration)/.test(error.message) ? error.message : 'Request could not be completed. Check the input and try again.';
      response.status(validation ? 400 : 422).json({ error: validation ? 'Invalid request fields.' : message });
    }
  };
  router.use((request, response, next) => {
    // Vite development and built production both use same-origin API requests.
    if (request.method === 'POST' && request.headers.origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001'].includes(request.headers.origin)) { response.status(403).json({ error: 'Cross-origin requests are not allowed.' }); return; }
    if (request.method === 'POST' && !request.is('application/json')) { response.status(415).json({ error: 'JSON requests are required.' }); return; }
    next();
  });
  router.get('/identities', (_request, response) => response.json({ identities }));
  router.post('/session', safe(async (request, response) => {
    const { identityId } = sessionInputSchema.parse(request.body);
    const session = createSession(identityId);
    response.cookie('portal_session', session.id, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 8 * 60 * 60 * 1000 });
    response.json({ identity: session.identity, preview: previewFor(session.identity), mode });
  }));
  router.get('/preview', safe(async (request, response) => response.json({ preview: previewFor(getSession(request.headers.cookie).identity) })));
  router.post('/accounts/validate', safe(async (request, response) => response.json({ account: normalizeAccount(accountInputSchema.parse(request.body).input), ownershipVerified: false })));
  router.post('/prepare', safe(async (request, response) => {
    const session = getSession(request.headers.cookie);
    const { account } = deliveryInputSchema.parse(request.body);
    const binding = { account: normalizeAccount(account), unityId: session.identity.unityId };
    response.json({ mode: 'dry-run', operations: [...nativeApp.prepare(binding), ...data.prepare(binding)] });
  }));
  router.post('/deliveries', safe(async (request, response) => {
    const session = getSession(request.headers.cookie);
    const { account, failProduct } = deliveryInputSchema.parse(request.body);
    response.json(await service.deliver(session.id, session.identity.unityId, account, mode === 'live-test' ? undefined : failProduct));
  }));
  router.get('/deliveries/:id', safe(async (request, response) => response.json(await service.get(getSession(request.headers.cookie).id, String(request.params.id)))));
  router.post('/deliveries/:id/retry', safe(async (request, response) => {
    const { product } = z.object({ product: z.enum(['nativeApp', 'data']) }).strict().parse(request.body);
    response.json(await service.retry(getSession(request.headers.cookie).id, String(request.params.id), product));
  }));
  router.post('/deliveries/:id/delete', safe(async (request, response) => {
    z.object({ confirm: z.literal(true) }).strict().parse(request.body);
    response.json(await service.remove(getSession(request.headers.cookie).id, String(request.params.id)));
  }));
  return router;
}