import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeAccount } from '../apps/api/src/lib/accountIdentifier';
import { createSession, getSession, identities, previewFor, requireTrustedBinding } from '../apps/api/src/identity';
import { identifier, literal, type SqlExecutor, type Row } from '../apps/api/src/lib/snowflake';
import { manifest, reconcileListing, resourceName } from '../apps/api/src/lib/distribution';
import { NativeAppListingDistributor } from '../apps/api/src/modules/native-app/NativeAppListingDistributor';
import { UnityDataListingDistributor } from '../apps/api/src/modules/data-sharing/UnityDataListingDistributor';
import { JobStore } from '../apps/api/src/services/JobStore';
import { OnboardingService } from '../apps/api/src/services/OnboardingService';
import { parse } from 'yaml';
import { viewBody } from '../apps/api/src/lib/viewDefinition';
const binding = { kind: 'trusted' as const, unityId: 'unity_demo_north', account: 'ACME.GAMES', approvedAccount: 'ACME.GAMES' };
const config = { namespace: 'UNITY_PORTAL', providerRole: 'PROVIDER' };
const dataConfig = { ...config, source: 'UNITY_DATA.PUBLIC.EVENTS', unityIdColumn: 'UNITY_ID', columns: ['PROJECT_NAME', 'ACTIVE_PLAYERS'], destinationSchema: 'UNITY_DATA.SHARING' };
const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
function executor(answer: (sql: string) => Row[] = () => []) { return { execute: vi.fn(async (sql: string) => answer(sql)) } satisfies SqlExecutor; }
describe('account normalization', () => {
  it.each([
    ['acme.games', 'ACME.GAMES'], ['acme-games_test', 'ACME.GAMES_TEST'],
    ['https://acme-games-test.snowflakecomputing.com/', 'ACME.GAMES_TEST'],
    ['https://app.snowflake.com/acme/games/worksheets', 'ACME.GAMES']
  ])('normalizes %s', (input, expected) => expect(normalizeAccount(input)).toBe(expected));
  it.each(['xy12345', 'xy12345.us-east-1', 'https://xy12345.snowflakecomputing.com', 'https://xy12345.us-east-1.aws.snowflakecomputing.com', 'https://acme-games.privatelink.snowflakecomputing.com', 'https://app.snowflake.com', 'https://acme-games.snowflakecomputing.com.evil.test', 'https://user:pass@acme-games.snowflakecomputing.com', 'http://acme-games.snowflakecomputing.com', "ACME.GAMES'; DROP DATABASE X", 'https://acme-games.snowflakecomputing.com/?token=secret'])('rejects ambiguous or unsafe %s', input => expect(() => normalizeAccount(input)).toThrow());
});
describe('identity and SQL boundaries', () => {
  it('scopes identity and preview to server-side fixtures', () => {
    const session = createSession('studio-orbit');
    expect(getSession(`portal_session=${session.id}`).identity.unityId).toBe('unity_demo_orbit');
    expect(previewFor(identities[1]).map(row => row.project)).toEqual(['Lunar Quest', 'Starfall']);
    expect(() => getSession('portal_session=forged')).toThrow();
  });
  it('rejects demo identities and mismatched trusted recipients', () => {
    expect(() => requireTrustedBinding({ ...binding, kind: 'demo' })).toThrow();
    expect(() => requireTrustedBinding({ ...binding, approvedAccount: 'OTHER.ACCOUNT' })).toThrow();
  });
  it('validates identifiers and escapes literals including backslashes', () => {
    expect(() => identifier('SOURCE; DROP DATABASE X')).toThrow();
    expect(literal("a\\b'c")).toBe("'a\\\\b''c'");
  });
  it('serializes a single recipient and disables resharing', () => {
    const yaml = parse(manifest(config, binding, 'Title\n$$; DROP SHARE X'));
    expect(yaml.targets.accounts).toEqual(['ACME.GAMES']);
    expect(yaml.resharing.enabled).toBe(false);
    expect(yaml.title).toBe('Title\n$$; DROP SHARE X');
    expect(resourceName(config, binding, 'APP')).not.toBe(resourceName(config, { ...binding, unityId: 'other' }, 'APP'));
  });
});
describe('isolated listing adapters', () => {
  it('requires package configuration without executing mutations', async () => {
    const sql = executor();
    expect((await new NativeAppListingDistributor(config, sql).deliver(binding)).status).toBe('not_configured');
    expect(sql.execute).not.toHaveBeenCalled();
  });
  it('checks release readiness and creates a draft before opt-in publication', async () => {
    const sql = executor(statement => statement.startsWith('SELECT CURRENT_ROLE') ? [{ ROLE: 'PROVIDER' }] : statement.startsWith('DESCRIBE APPLICATION') ? [{ property: 'distribution', value: 'EXTERNAL' }, { property: 'owner', value: 'PROVIDER' }] : statement.startsWith('SHOW VERSIONS') ? [{ version: 'V1', patch: 0, review_status: 'APPROVED' }] : statement.startsWith('SHOW RELEASE DIRECTIVES') ? [{ name: 'DEFAULT', version: 'V1', patch: 0, release_status: 'DEPLOYED' }] : []);
    const distributor = new NativeAppListingDistributor({ ...config, applicationPackage: 'UNITY_PACKAGE' }, sql);
    const result = await distributor.deliver(binding, true);
    expect(result.status).toBe('published');
    const statements = sql.execute.mock.calls.map(call => call[0]);
    expect(statements.some(statement => statement.includes('PUBLISH=FALSE REVIEW=FALSE'))).toBe(true);
    expect(statements.at(-1)).toMatch(/ALTER LISTING .* PUBLISH/);
    expect(statements.some(statement => /ALTER APPLICATION/.test(statement))).toBe(false);
  });
  it('blocks demo delivery even with a configured executor', async () => {
    const sql = executor();
    const distributor = new NativeAppListingDistributor({ ...config, applicationPackage: 'UNITY_PACKAGE' }, sql);
    expect((await distributor.deliver({ ...binding, kind: 'demo' } as never)).status).toBe('blocked');
    expect(sql.execute).not.toHaveBeenCalled();
  });
  it('filters at the secure view and never grants source-table access', () => {
    const plan = new UnityDataListingDistributor(dataConfig, executor()).prepare({ ...binding, unityId: "north' OR 1=1 --" });
    expect(plan[0].sql).toContain('WHERE "UNITY_ID" = \'north\'\' OR 1=1 --\'');
    expect(plan[0].sql).not.toContain('SELECT *');
    expect(plan.map(item => item.sql).join('\n')).not.toMatch(/GRANT SELECT ON TABLE/);
    expect(plan.at(-2)?.sql).toContain('PUBLISH=FALSE');
  });
  it('fails closed on missing source and cross-region configuration', async () => {
    expect((await new UnityDataListingDistributor(config, executor()).deliver(binding)).status).toBe('not_configured');
    expect((await new UnityDataListingDistributor({ ...dataConfig, crossRegion: true }, executor()).deliver(binding)).status).toBe('blocked');
  });
  it('uses distinct package and data auto-fulfillment manifests', () => {
    const app = new NativeAppListingDistributor({ ...config, applicationPackage: 'PKG', crossRegion: true }, executor()).prepare(binding)[0].sql;
    const data = new UnityDataListingDistributor({ ...dataConfig, crossRegion: true, refreshMinutes: 60 }, executor()).prepare(binding).at(-2)!.sql;
    expect(app).toContain('SUB_DATABASE_WITH_REFERENCE_USAGE'); expect(app).not.toContain('refresh_schedule');
    expect(data).toContain('SUB_DATABASE'); expect(data).toContain('60 MINUTE');
  });
  it('rejects existing listing target conflicts', async () => {
    const name = resourceName(config, binding, 'APP');
    const yaml = manifest(config, binding, 'App');
    const sql = executor(statement => statement.startsWith('SHOW') ? [{ name, state: 'DRAFT' }] : [{ owner: 'PROVIDER', application_package: 'PKG', comment: name, manifest_yaml: yaml.replace('ACME.GAMES', 'OTHER.ACCOUNT') }]);
    await expect(reconcileListing(sql, name, 'application_package', 'PKG', yaml, name, 'PROVIDER')).rejects.toThrow();
  });
  it('accepts an equivalent manifest with reordered mapping keys', async () => {
    const name = resourceName(config, binding, 'APP');
    const yaml = manifest(config, binding, 'App');
    const reordered = Object.fromEntries(Object.entries(parse(yaml)).reverse());
    const sql = executor(statement => statement.startsWith('SHOW') ? [{ name, state: 'DRAFT' }] : [{ owner: 'PROVIDER', application_package: 'PKG', comment: name, manifest_yaml: JSON.stringify(reordered) }]);
    expect(await reconcileListing(sql, name, 'application_package', 'PKG', yaml, name, 'PROVIDER')).toBe('draft');
  });
  it('creates data resources and grants only the filtered view in draft mode', async () => {
    const sql = executor(statement => statement.startsWith('SELECT CURRENT_ROLE') ? [{ ROLE: 'PROVIDER' }] : []);
    expect((await new UnityDataListingDistributor(dataConfig, sql).deliver(binding)).status).toBe('draft');
    const mutations = sql.execute.mock.calls.map(([statement]) => statement).filter(statement => /^(CREATE|GRANT|ALTER)/.test(statement));
    expect(mutations).toHaveLength(6);
    expect(mutations.at(-1)).toContain('PUBLISH=FALSE REVIEW=FALSE');
    expect(mutations.join('\n')).not.toMatch(/GRANT SELECT ON TABLE/);
  });
  it('extracts the defining AS rather than an AS inside a comment or literal', () => {
    expect(viewBody("CREATE SECURE VIEW V COMMENT=' AS fake' AS SELECT ' AS value';")).toBe("SELECT ' AS value'");
    expect(viewBody('CREATE VIEW V AS SELECT * FROM SECRET -- AS SELECT FILTERED;')).toBe('SELECT * FROM SECRET -- AS SELECT FILTERED');
  });
  it('blocks a package whose default directive belongs to ALPHA', async () => {
    const sql = executor(statement => statement.startsWith('SELECT CURRENT_ROLE') ? [{ ROLE: 'PROVIDER' }] : statement.startsWith('DESCRIBE APPLICATION') ? [{ property: 'distribution', value: 'EXTERNAL' }, { property: 'owner', value: 'PROVIDER' }, { property: 'release_channels', value: 'ENABLED' }] : statement.startsWith('SHOW VERSIONS') ? [{ version: 'V1', patch: 0, review_status: 'APPROVED' }] : statement.startsWith('SHOW RELEASE DIRECTIVES') ? [{ name: 'DEFAULT', release_channel: 'ALPHA', version: 'V1', patch: 0, release_status: 'DEPLOYED' }] : []);
    expect((await new NativeAppListingDistributor({ ...config, applicationPackage: 'PKG' }, sql).deliver(binding, true)).status).toBe('blocked');
    expect(sql.execute.mock.calls.some(([statement]) => /^(CREATE|ALTER)/.test(statement))).toBe(false);
  });
  it('blocks an unexpected execution role', async () => {
    const sql = executor(() => [{ ROLE: 'OTHER' }]);
    expect((await new NativeAppListingDistributor({ ...config, applicationPackage: 'PKG' }, sql).deliver(binding)).status).toBe('blocked');
    expect(sql.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects unexpected grants without mutations', async () => {
    const name = resourceName(config, binding, 'DATA');
    const sql = executor(statement => statement.startsWith('SELECT CURRENT_ROLE') ? [{ ROLE: 'PROVIDER' }] : statement.startsWith('SHOW SHARES') ? [{ name: `${name}_SHARE`, owner: 'PROVIDER', comment: name, to: '' }] : statement.startsWith('SHOW GRANTS') ? [{ privilege: 'SELECT', granted_on: 'TABLE', name: 'UNITY_DATA.PUBLIC.EVENTS' }] : []);
    expect((await new UnityDataListingDistributor(dataConfig, sql).deliver(binding)).status).toBe('blocked');
    expect(sql.execute.mock.calls.some(([statement]) => /^(CREATE|GRANT|ALTER)/.test(statement))).toBe(false);
  });
});
describe('durable local orchestration', () => {
  async function service() { const path = await mkdtemp(join(tmpdir(), 'unity-test-')); temporary.push(path); return new OnboardingService(new JobStore(join(path, 'jobs.json')), 'mock'); }
  it('deduplicates concurrent requests and preserves the successful product on retry', async () => {
    const instance = await service();
    const [first, second] = await Promise.all([instance.deliver('session', binding.unityId, binding.account, 'nativeApp'), instance.deliver('session', binding.unityId, binding.account)]);
    expect(first.id).toBe(second.id); expect(first.products.nativeApp.status).toBe('failed');
    const data = first.products.data;
    const retried = await instance.retry('session', first.id, 'nativeApp');
    expect(retried.products.nativeApp.status).toBe('simulated'); expect(retried.products.data).toEqual(data);
    await expect(instance.get('different-session', first.id)).rejects.toThrow();
  });
  it('persists separate identities and does not expose exception secrets', async () => {
    const path = await mkdtemp(join(tmpdir(), 'unity-test-')); temporary.push(path);
    const failing = { deliver: vi.fn(async () => { throw new Error('password=TOPSECRET'); }) };
    const good = { deliver: vi.fn(async () => ({ status: 'simulated' as const, message: 'ok' })) };
    const instance = new OnboardingService(new JobStore(join(path, 'jobs.json')), 'mock', { nativeApp: failing, data: good });
    const job = await instance.deliver('session', binding.unityId, binding.account);
    expect(JSON.stringify(job)).not.toContain('TOPSECRET'); expect(job.products.data.status).toBe('simulated');
    expect((await new JobStore(join(path, 'jobs.json')).all())[0].id).toBe(job.id);
  });
  it('dry-run never invokes either delivery executor', async () => {
    const path = await mkdtemp(join(tmpdir(), 'unity-test-')); temporary.push(path);
    const delivery = { deliver: vi.fn(async () => ({ status: 'simulated' as const, message: 'unexpected' })) };
    const instance = new OnboardingService(new JobStore(join(path, 'jobs.json')), 'dry-run', { nativeApp: delivery, data: delivery });
    const job = await instance.deliver('session', binding.unityId, binding.account);
    expect(job.products.data.message).toContain('No SQL executed'); expect(delivery.deliver).not.toHaveBeenCalled();
  });
});