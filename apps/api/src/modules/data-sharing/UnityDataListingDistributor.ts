import type { Operation, ProductResult } from '@portal/contracts';
import type { TrustedBinding } from '../../identity';
import { assertLive, dropOwned, type ListingDetails, executeListing, listingOperations, manifest, reconcileListing, resourceName, type DeliveryBinding, type Distributor, type ListingConfig } from '../../lib/distribution';
import { field, identifier, literal, type SqlExecutor } from '../../lib/snowflake';
import { viewBody } from '../../lib/viewDefinition';
export type DataDistributor = Distributor;
export type DataConfig = ListingConfig & { source?: string; unityIdColumn?: string; columns?: string[]; destinationSchema?: string; refreshMinutes?: number };
export class UnityDataListingDistributor implements DataDistributor {
  constructor(private config: DataConfig, private executor: SqlExecutor) {}
  private resources(binding: DeliveryBinding) {
    const { source, unityIdColumn, columns, destinationSchema } = this.config;
    if (!source || !unityIdColumn || !columns?.length || !destinationSchema) throw new Error('Data source configuration is incomplete.');
    identifier(source, 3); identifier(unityIdColumn); identifier(destinationSchema, 2);
    columns.forEach(column => identifier(column));
    // A single-database layout avoids implicit cross-database grant/fulfillment changes.
    if (source.split('.')[0].toUpperCase() !== destinationSchema.split('.')[0].toUpperCase()) throw new Error('Source and sharing schema must be in the same database.');
    if (this.config.crossRegion && (!Number.isInteger(this.config.refreshMinutes) || this.config.refreshMinutes! < 10 || this.config.refreshMinutes! > 11520)) throw new Error('Configure a valid auto-fulfillment refresh interval.');
    const name = resourceName(this.config, binding, 'DATA');
    const view = `${destinationSchema}.${name}_VIEW`;
    const share = `${name}_SHARE`;
    const select = `SELECT ${columns.map(column => identifier(column)).join(', ')} FROM ${identifier(source, 3)} WHERE ${identifier(unityIdColumn)} = ${literal(binding.unityId)}`;
    const [, schema] = destinationSchema.toUpperCase().split('.');
    // Snowflake compiles example queries against the share and rejects database-qualified names.
    const details: ListingDetails = {
      subtitle: 'Daily player and revenue metrics for your Unity projects',
      description: `Daily active players and revenue for each project owned by Unity ID \`${binding.unityId}\`. Data from other studios is never included.`,
      businessNeeds: [{ name: 'Market Analysis', description: 'Track player activity and revenue across your live games.' }, { name: 'Unity game telemetry', description: 'Daily per-project metrics delivered from Unity.', type: 'CUSTOM' }],
      examples: [
        { title: 'Daily active players by project', description: 'Player trend for each project.', query: `SELECT PROJECT_NAME, EVENT_DATE, ACTIVE_PLAYERS FROM ${schema}.${name}_VIEW ORDER BY EVENT_DATE` },
        { title: 'Revenue per project', description: 'Total revenue for each project.', query: `SELECT PROJECT_NAME, SUM(REVENUE_USD) AS REVENUE_USD FROM ${schema}.${name}_VIEW GROUP BY PROJECT_NAME` }
      ],
      extra: { data_dictionary: { featured: { database: destinationSchema.split('.')[0].toUpperCase(), objects: [{ name: `${name}_VIEW`, schema, domain: 'VIEW' }] } }, data_preview: { has_pii: false } }
    };
    const yaml = manifest(this.config, binding, 'Unity-scoped dataset', { refresh_type: 'SUB_DATABASE', refresh_schedule: `${this.config.refreshMinutes} MINUTE` }, details);
    return { name, view, share, select, yaml, destinationSchema };
  }
  prepare(binding: DeliveryBinding): Operation[] {
    const { name, view, share, select, yaml, destinationSchema } = this.resources(binding);
    return [
      { label: 'Create Unity-filtered secure view', phase: 'prepare', sql: `CREATE SECURE VIEW ${identifier(view, 3)} COMMENT=${literal(name)} AS ${select}` },
      { label: 'Create isolated secure share', phase: 'prepare', sql: `CREATE SHARE ${identifier(share)} COMMENT=${literal(name)}` },
      { label: 'Grant database usage only', phase: 'prepare', sql: `GRANT USAGE ON DATABASE ${identifier(destinationSchema.split('.')[0])} TO SHARE ${identifier(share)}` },
      { label: 'Grant sharing schema usage only', phase: 'prepare', sql: `GRANT USAGE ON SCHEMA ${identifier(destinationSchema, 2)} TO SHARE ${identifier(share)}` },
      { label: 'Grant filtered view only (never source table)', phase: 'prepare', sql: `GRANT SELECT ON VIEW ${identifier(view, 3)} TO SHARE ${identifier(share)}` },
      ...listingOperations(name, 'SHARE', share, yaml, name)
    ];
  }
  async deliver(binding: TrustedBinding, publish = false): Promise<ProductResult> {
    try {
      assertLive(this.config, binding, publish);
      if (!this.config.source || !this.config.columns?.length || !this.config.destinationSchema || !this.config.unityIdColumn) return { status: 'not_configured', message: 'Configure source, Unity ID column, explicit output columns, and an existing sharing schema.' };
      const { name, view, share, select, yaml, destinationSchema } = this.resources(binding);
      const [context] = await this.executor.execute('SELECT CURRENT_ROLE() AS ROLE');
      if (String(field(context, 'role')).toUpperCase() !== this.config.providerRole!.toUpperCase()) throw new Error('Unexpected provider role.');
      const operations = this.prepare(binding);
      const views = await this.executor.execute(`SHOW VIEWS LIKE ${literal(`${name}_VIEW`)} IN SCHEMA ${identifier(destinationSchema, 2)}`);
      const existingView = views.find(row => field(row, 'name') === `${name}_VIEW`);
      if (existingView) {
        if (field(existingView, 'comment') !== name || String(field(existingView, 'owner')).toUpperCase() !== this.config.providerRole!.toUpperCase() || String(field(existingView, 'is_secure')).toUpperCase() !== 'TRUE') throw new Error('Existing view conflicts.');
        const [ddlRow] = await this.executor.execute(`SELECT GET_DDL('VIEW', ${literal(view.toUpperCase())}) AS DDL`);
        const definition = viewBody(String(field(ddlRow, 'ddl')));
        // Strict comparison intentionally fails closed when GET_DDL rewrites cannot be reconciled.
        if (definition !== select) throw new Error('Existing view definition cannot be verified.');
      }
      const shares = await this.executor.execute(`SHOW SHARES LIKE ${literal(share)}`);
      const existingShare = shares.find(row => String(field(row, 'name')).toUpperCase().split('.').at(-1) === share);
      if (existingShare) {
        if (field(existingShare, 'comment') !== name || String(field(existingShare, 'owner')).toUpperCase() !== this.config.providerRole!.toUpperCase() || (field(existingShare, 'to') && String(field(existingShare, 'to')).trim() !== '')) throw new Error('Existing share ownership or direct recipients conflict.');
        const grants = await this.executor.execute(`SHOW GRANTS TO SHARE ${identifier(share)}`);
        const allowed = new Set([`USAGE|DATABASE|${destinationSchema.split('.')[0].toUpperCase()}`, `USAGE|SCHEMA|${destinationSchema.toUpperCase()}`, `SELECT|VIEW|${view.toUpperCase()}`]);
        if (grants.some(row => !allowed.has([field(row, 'privilege'), field(row, 'granted_on'), field(row, 'name')].map(String).map(value => value.toUpperCase()).join('|')))) throw new Error('Share has unexpected grants.');
      }
      // Reconcile the listing before creating or granting any resources.
      const state = await reconcileListing(this.executor, name, 'share', share, yaml, name, this.config.providerRole!);
      if (!existingView) await this.executor.execute(operations[0].sql);
      if (!existingShare) await this.executor.execute(operations[1].sql);
      for (const operation of operations.slice(2, 5)) await this.executor.execute(operation.sql);
      const status = await executeListing(this.executor, operations.slice(5), state, publish);
      return { status, listingName: name, message: status === 'published' ? 'Private data listing published. Fulfillment and consumer database creation remain separate.' : 'Unity-scoped listing prepared as a draft; not shared yet.' };
    } catch (error) { console.error('[data] delivery blocked:', error instanceof Error ? error.message : error); return { status: 'blocked', message: 'Data delivery blocked. Check approved binding, explicit source configuration, provider ownership, and resource conflicts.' }; }
  }
  async remove(binding: TrustedBinding): Promise<ProductResult> {
    try {
      assertLive(this.config, binding);
      const { name, view, share, destinationSchema } = this.resources(binding);
      const role = this.config.providerRole!;
      // Listing first, then the share it exposes, then the filtered view. The source table is never touched.
      const dropped = [await dropOwned(this.executor, 'LISTING', name, name, role), await dropOwned(this.executor, 'SHARE', share, name, role), await dropOwned(this.executor, 'VIEW', view, name, role, destinationSchema)];
      return { status: 'removed', listingName: name, message: dropped.some(Boolean) ? 'Data listing, share and filtered view deleted. Source data is kept.' : 'No data listing to delete.' };
    } catch (error) { console.error('[data] removal blocked:', error instanceof Error ? error.message : error); return { status: 'blocked', message: 'Data listing could not be deleted. Check the API server log.' }; }
  }
}