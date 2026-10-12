import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProductResult } from '@portal/contracts';
import { liveTestSettings } from '../apps/api/src/routes';
import { connectionFromToml } from '../apps/api/src/lib/snowflake';
import { JobStore } from '../apps/api/src/services/JobStore';
import { OnboardingService } from '../apps/api/src/services/OnboardingService';
import type { TrustedBinding } from '../apps/api/src/identity';
import { assertLive, dropOwned, manifest } from '../apps/api/src/lib/distribution';
import type { Row, SqlExecutor } from '../apps/api/src/lib/snowflake';
import { parse } from 'yaml';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function tempDir() { const path = await mkdtemp(join(tmpdir(), 'unity-live-')); temporary.push(path); return path; }
const env = { SNOWFLAKE_CONNECTION_NAME: 'Main', SNOWFLAKE_ROLE: 'ACCOUNTADMIN', SNOWFLAKE_WAREHOUSE: 'DEMO_WH' };

describe('live-test startup gate', () => {
  it('requires every setting and defaults to STANDARD terms', () => {
    for (const key of Object.keys(env)) expect(() => liveTestSettings({ ...env, [key]: '' })).toThrow(/requires/);
    expect(liveTestSettings(env)).toMatchObject({ role: 'ACCOUNTADMIN', terms: 'STANDARD' });
  });
});

describe('live-test private manifests', () => {
  const config = { namespace: 'UNITY_PORTAL', providerRole: 'ACCOUNTADMIN', terms: 'OFFLINE' as const, draftOnly: true };
  it('targets exactly the entered account with manual fulfillment', () => {
    const yaml = parse(manifest(config, { unityId: 'unity_demo_orbit', account: 'TESTORG.CONSUMER_ONE' }, 'T'));
    expect(yaml.targets).toEqual({ accounts: ['TESTORG.CONSUMER_ONE'] });
    expect(yaml.auto_fulfillment).toBeUndefined();
    expect(yaml.resharing).toEqual({ enabled: false });
  });
  it('fills every listing section the Provider Studio checklist asks for', () => {
    const details = { subtitle: 'S', description: 'D', businessNeeds: [{ name: 'Market Analysis', description: 'x' }], examples: [{ title: 'E', description: 'e', query: 'SELECT 1 FROM PORTAL_SHARING.V' }] };
    const yaml = parse(manifest({ ...config, profile: 'Unity' }, { unityId: 'u', account: 'TESTORG.CONSUMER_ONE' }, 'T', undefined, details));
    expect(yaml).toMatchObject({ title: 'T', subtitle: 'S', profile: 'Unity', draft_access_type: 'FREE', categories: ['MEDIA'], listing_terms: { type: 'OFFLINE' }, resources: { documentation: 'https://docs.unity.com/' }, usage_examples: details.examples, business_needs: details.businessNeeds });
    expect(yaml.description).toBe('D');
    expect(yaml.data_attributes.time.time_range).toEqual({ time_frame: 'LAST', units: 'DAYS', value: 30 });
    expect(yaml.targets).toEqual({ accounts: ['TESTORG.CONSUMER_ONE'] });
  });
  it('omits the profile when none is configured', () => {
    const details = { subtitle: 'S', description: 'D', businessNeeds: [], examples: [] };
    expect(parse(manifest(config, { unityId: 'u', account: 'TESTORG.CONSUMER_ONE' }, 'T', undefined, details)).profile).toBeUndefined();
  });
  it('refuses to publish', () => {
    const binding = { kind: 'trusted' as const, unityId: 'u', account: 'A.B', approvedAccount: 'A.B' };
    expect(() => assertLive(config, binding, true)).toThrow(/cannot be published/);
    expect(() => assertLive(config, binding, false)).not.toThrow();
  });
});

describe('connections.toml loader', () => {
  it('maps the named entry and overrides role and warehouse', async () => {
    const file = join(await tempDir(), 'connections.toml');
    await writeFile(file, '[Main]\naccount = "org-acct"\nuser = "me"\npassword = "secret"\nauthenticator = "snowflake"\nrole = "PUBLIC"\n');
    expect(await connectionFromToml('Main', 'ACCOUNTADMIN', 'DEMO_WH', file)).toEqual({ account: 'org-acct', username: 'me', password: 'secret', authenticator: 'SNOWFLAKE', role: 'ACCOUNTADMIN', warehouse: 'DEMO_WH' });
    await expect(connectionFromToml('Missing', 'R', 'W', file)).rejects.toThrow('not configured');
  });
});

describe('live-test orchestration', () => {
  async function setup(results: Partial<Record<'nativeApp' | 'data', ProductResult[]>>) {
    const calls: { product: string; binding: TrustedBinding; publish: boolean }[] = [];
    const fake = (product: 'nativeApp' | 'data') => ({ prepare: () => [], remove: vi.fn(async () => { calls.push({ product, binding: {} as TrustedBinding, publish: false }); return { status: 'removed', message: 'gone' } as ProductResult; }), deliver: vi.fn(async (binding: TrustedBinding, publish = false) => { calls.push({ product, binding, publish }); return results[product]?.shift() ?? { status: publish ? 'published' : 'draft', message: 'ok' } as ProductResult; }) });
    const service = new OnboardingService(new JobStore(join(await tempDir(), 'jobs.json')), 'live-test', undefined, { distributors: { nativeApp: fake('nativeApp'), data: fake('data') } });
    return { service, calls };
  }
  it('creates drafts and retries only the blocked product', async () => {
    const { service, calls } = await setup({ data: [{ status: 'blocked', message: 'x' }] });
    const job = await service.deliver('s', 'unity_demo_orbit', 'testorg.consumer_one');
    expect(job.mode).toBe('live-test');
    expect(calls[0]).toMatchObject({ publish: false, binding: { kind: 'trusted', account: 'TESTORG.CONSUMER_ONE', unityId: 'unity_demo_orbit' } });
    expect(job.products.data.status).toBe('blocked');
    const retried = await service.retry('s', job.id, 'data');
    expect(retried.products.data.status).toBe('draft');
    expect(calls.filter(call => call.product === 'nativeApp')).toHaveLength(1);
    expect(calls.some(call => call.publish)).toBe(false);
  });
});

describe('portal-owned deletion', () => {
  function executor(rows: Row[]) { const sql: string[] = []; return { sql, execute: async (text: string) => { sql.push(text); return text.startsWith('SHOW') ? rows : []; } } satisfies SqlExecutor & { sql: string[] }; }
  it('unpublishes then drops a published listing it owns', async () => {
    const ex = executor([{ name: 'UNITY_PORTAL_APP_X', owner: 'ACCOUNTADMIN', comment: 'UNITY_PORTAL_APP_X', state: 'PUBLISHED' }]);
    expect(await dropOwned(ex, 'LISTING', 'UNITY_PORTAL_APP_X', 'UNITY_PORTAL_APP_X', 'ACCOUNTADMIN')).toBe(true);
    expect(ex.sql.slice(1)).toEqual(['ALTER LISTING "UNITY_PORTAL_APP_X" UNPUBLISH', 'DROP LISTING "UNITY_PORTAL_APP_X"']);
  });
  it('refuses objects with another owner or marker, and skips missing ones', async () => {
    await expect(dropOwned(executor([{ name: 'V', owner: 'SYSADMIN', comment: 'V' }]), 'VIEW', 'DB.S.V', 'V', 'ACCOUNTADMIN', 'DB.S')).rejects.toThrow(/not owned/);
    await expect(dropOwned(executor([{ name: 'V', owner: 'ACCOUNTADMIN', comment: 'other' }]), 'VIEW', 'DB.S.V', 'V', 'ACCOUNTADMIN', 'DB.S')).rejects.toThrow(/not owned/);
    const ex = executor([]);
    expect(await dropOwned(ex, 'SHARE', 'S', 'S', 'ACCOUNTADMIN')).toBe(false);
    expect(ex.sql).toHaveLength(1);
  });
  it('removes both products and lets the account be delivered again', async () => {
    const service = new OnboardingService(new JobStore(join(await tempDir(), 'jobs.json')), 'live-test', undefined, { distributors: { nativeApp: { prepare: () => [], deliver: async () => ({ status: 'draft', message: 'd' }), remove: async () => ({ status: 'removed', message: 'r' }) }, data: { prepare: () => [], deliver: async () => ({ status: 'draft', message: 'd' }), remove: async () => ({ status: 'removed', message: 'r' }) } } });
    const job = await service.deliver('s', 'unity_demo_orbit', 'testorg.consumer_one');
    const removed = await service.remove('s', job.id);
    expect(Object.values(removed.products).map(p => p.status)).toEqual(['removed', 'removed']);
    expect((await service.deliver('s', 'unity_demo_orbit', 'testorg.consumer_one')).id).not.toBe(job.id);
  });
});
