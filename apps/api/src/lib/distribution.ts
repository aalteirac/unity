import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'yaml';
import type { Operation, ProductResult } from '@portal/contracts';
import { requireTrustedBinding, type TrustedBinding } from '../identity';
import { field, identifier, literal, type SqlExecutor } from './snowflake';
export type DeliveryBinding = { unityId: string; account: string };
export type ListingConfig = { namespace: string; providerRole?: string; terms?: 'STANDARD' | 'OFFLINE'; crossRegion?: boolean; autoFulfillmentReady?: boolean; draftOnly?: boolean; profile?: string; documentationUrl?: string };
// Product-specific listing content. Field names follow what Snowflake accepts (e.g. time_range.units, not unit).
export type ListingDetails = { subtitle: string; description: string; businessNeeds: { name: string; description: string; type?: 'CUSTOM' }[]; examples: { title: string; description: string; query: string }[]; extra?: Record<string, unknown> };
const dataAttributes = { refresh_rate: 'DAILY', geography: { granularity: ['COUNTRY'], geo_option: 'GLOBAL' }, time: { granularity: 'DAILY', time_range: { time_frame: 'LAST', units: 'DAYS', value: 30 } } };
export interface Distributor {
  prepare(binding: DeliveryBinding): Operation[];
  deliver(binding: TrustedBinding, publish?: boolean): Promise<ProductResult>;
  remove?(binding: TrustedBinding): Promise<ProductResult>;
}
export function resourceName(config: ListingConfig, binding: DeliveryBinding, type: string) {
  identifier(config.namespace);
  const hash = createHash('sha256').update(JSON.stringify([binding.unityId, binding.account])).digest('hex').slice(0, 24).toUpperCase();
  const name = `${config.namespace.toUpperCase()}_${type}_${hash}`;
  identifier(`${name}_SHARE`);
  return name;
}
export function manifest(config: ListingConfig, binding: DeliveryBinding, title: string, fulfillment?: object, details?: ListingDetails) {
  if (!/^[A-Z][A-Z0-9]*\.[A-Z][A-Z0-9_]*$/.test(binding.account)) throw new Error('A canonical recipient is required.');
  const content = details ? {
    subtitle: details.subtitle,
    ...(config.profile ? { profile: config.profile } : {}),
    draft_access_type: 'FREE',
    business_needs: details.businessNeeds,
    usage_examples: details.examples,
    categories: ['MEDIA'],
    resources: { documentation: config.documentationUrl ?? 'https://docs.unity.com/' },
    data_attributes: dataAttributes,
    ...details.extra
  } : {};
  // Private listings target exactly the bound account. Fulfillment stays manual unless crossRegion is configured.
  return stringify({ title, description: details?.description ?? 'Private Unity integration delivery for the approved consumer account.', listing_terms: { type: config.terms ?? 'STANDARD' }, targets: { accounts: [binding.account] }, resharing: { enabled: false }, ...content, ...(config.crossRegion ? { auto_fulfillment: fulfillment } : {}) });
}
export function listingOperations(name: string, product: 'APPLICATION PACKAGE' | 'SHARE', object: string, yaml: string, marker: string): Operation[] {
  return [
    { label: `Create private ${product === 'SHARE' ? 'data' : 'Native App'} listing (draft)`, phase: 'prepare', sql: `CREATE EXTERNAL LISTING ${identifier(name)} ${product} ${identifier(object)} AS ${literal(yaml)} PUBLISH=FALSE REVIEW=FALSE COMMENT=${literal(marker)}` },
    { label: 'Publish private listing (explicit opt-in only)', phase: 'publish', sql: `ALTER LISTING ${identifier(name)} PUBLISH` }
  ];
}
export function assertLive(config: ListingConfig, binding: TrustedBinding, publish = false) {
  requireTrustedBinding(binding);
  if (publish && config.draftOnly) throw new Error('Live-test listings are created as drafts only and cannot be published.');
  if (!config.providerRole) throw new Error('Provider ownership role must be configured.');
  identifier(config.providerRole);
  if (config.crossRegion && !config.autoFulfillmentReady) throw new Error('Cross-region fulfillment prerequisites have not been confirmed.');
}
// Snowflake stores manifests with business_needs[].type defaulted, draft_access_type removed and product_types derived; everything else must match exactly.
function normalizeManifest(value: Record<string, unknown>) {
  const { draft_access_type: _ignored, product_types: _derived, ...rest } = value ?? {};
  if (Array.isArray(rest.business_needs)) rest.business_needs = rest.business_needs.map((need: Record<string, unknown>) => ({ type: 'STANDARD', ...need }));
  // Profile names are stored as quoted identifiers.
  if (typeof rest.profile === 'string') rest.profile = rest.profile.replace(/^"(.*)"$/, '$1');
  return rest;
}
export async function reconcileListing(executor: SqlExecutor, name: string, productField: 'application_package' | 'share', object: string, yaml: string, marker: string, role: string): Promise<'absent' | 'draft' | 'published'> {
  const rows = await executor.execute(`SHOW LISTINGS LIKE ${literal(name)}`);
  const exact = rows.find(row => String(field(row, 'name')).toUpperCase() === name);
  if (!exact) return 'absent';
  const state = String(field(exact, 'state')).toUpperCase();
  const [listing] = await executor.execute(`DESCRIBE LISTING ${identifier(name)} REVISION = ${state === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'}`);
  if (!listing || String(field(listing, 'owner')).toUpperCase() !== role.toUpperCase() || String(field(listing, productField)).toUpperCase() !== object.toUpperCase() || field(listing, 'comment') !== marker) throw new Error('Existing listing ownership or product conflicts with this delivery.');
  const actual = normalizeManifest(parse(String(field(listing, 'manifest_yaml'))));
  if (!isDeepStrictEqual(actual, normalizeManifest(parse(yaml)))) throw new Error('Existing listing scope differs. Refusing to change its targets.');
  if (!['DRAFT', 'PUBLISHED'].includes(state)) throw new Error('Existing listing state requires provider review.');
  return state === 'PUBLISHED' ? 'published' : 'draft';
}
export async function executeListing(executor: SqlExecutor, operations: Operation[], state: 'absent' | 'draft' | 'published', publish: boolean) {
  if (state === 'absent') await executor.execute(operations[0].sql);
  if (publish && state !== 'published') await executor.execute(operations[1].sql);
  return publish || state === 'published' ? 'published' as const : 'draft' as const;
}
// Drops one portal-owned object. Anything with a different owner or marker comment is refused, never dropped.
export async function dropOwned(executor: SqlExecutor, kind: 'LISTING' | 'SHARE' | 'VIEW', name: string, marker: string, role: string, schema?: string): Promise<boolean> {
  const leaf = name.split('.').at(-1)!;
  const show = kind === 'LISTING' ? 'LISTINGS' : kind === 'SHARE' ? 'SHARES' : 'VIEWS';
  const rows = await executor.execute(`SHOW ${show} LIKE ${literal(leaf)}${schema ? ` IN SCHEMA ${identifier(schema, 2)}` : ''}`);
  const row = rows.find(item => String(field(item, 'name')).toUpperCase().split('.').at(-1) === leaf.toUpperCase());
  if (!row) return false;
  if (String(field(row, 'owner')).toUpperCase() !== role.toUpperCase() || field(row, 'comment') !== marker) throw new Error(`Existing ${kind.toLowerCase()} is not owned by this portal delivery.`);
  // Published listings must be unpublished before Snowflake allows DROP.
  if (kind === 'LISTING' && String(field(row, 'state')).toUpperCase() === 'PUBLISHED') await executor.execute(`ALTER LISTING ${identifier(leaf)} UNPUBLISH`);
  await executor.execute(`DROP ${kind} ${identifier(name, name.split('.').length)}`);
  return true;
}