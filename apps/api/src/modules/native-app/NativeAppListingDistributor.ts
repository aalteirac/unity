import type { Operation, ProductResult } from '@portal/contracts';
import type { TrustedBinding } from '../../identity';
import { assertLive, dropOwned, type ListingDetails, executeListing, listingOperations, manifest, reconcileListing, resourceName, type DeliveryBinding, type Distributor, type ListingConfig } from '../../lib/distribution';
import { field, identifier, type SqlExecutor } from '../../lib/snowflake';
export type NativeAppDistributor = Distributor;
export type NativeAppConfig = ListingConfig & { applicationPackage?: string };
// Sample listing content; the app is the dummy in native-app/.
const appDetails: ListingDetails = {
  subtitle: 'Dashboards for your Unity game metrics, inside Snowflake',
  description: 'Unity Analytics brings a ready-made Streamlit dashboard and helper functions into your Snowflake account. Pair it with your Unity-scoped dataset listing to explore active players and revenue per project.',
  businessNeeds: [{ name: 'Market Analysis', description: 'Explore player and revenue trends across your live games with a ready-made dashboard.' }, { name: 'Game live-ops analytics', description: 'Monitor launches and live events for each Unity project.', type: 'CUSTOM' }],
  examples: [{ title: 'Check the installation', description: 'Confirms the app is installed and ready.', query: 'SELECT core.hello()' }, { title: 'Preview sample metrics', description: 'Reads the sample metrics bundled with the app.', query: 'SELECT * FROM core.sample_metrics' }]
};
export class NativeAppListingDistributor implements NativeAppDistributor {
  constructor(private config: NativeAppConfig, private executor: SqlExecutor) {}
  prepare(binding: DeliveryBinding): Operation[] {
    if (!this.config.applicationPackage) return [];
    const name = resourceName(this.config, binding, 'APP');
    const yaml = manifest(this.config, binding, 'Unity Analytics Native App', { refresh_type: 'SUB_DATABASE_WITH_REFERENCE_USAGE' }, appDetails);
    return listingOperations(name, 'APPLICATION PACKAGE', this.config.applicationPackage, yaml, name);
  }
  async deliver(binding: TrustedBinding, publish = false): Promise<ProductResult> {
    try {
      assertLive(this.config, binding, publish);
      const appPackage = this.config.applicationPackage;
      if (!appPackage) return { status: 'not_configured', message: 'An existing Native App package must be configured.' };
      const [context] = await this.executor.execute('SELECT CURRENT_ROLE() AS ROLE');
      if (String(field(context, 'role')).toUpperCase() !== this.config.providerRole!.toUpperCase()) throw new Error('Unexpected provider role.');
      const properties = await this.executor.execute(`DESCRIBE APPLICATION PACKAGE ${identifier(appPackage)}`);
      const get = (name: string) => { const row = properties.find(item => field(item, 'property') === name); return row ? field(row, 'value') : undefined; };
      if (String(get('distribution')).toUpperCase() !== 'EXTERNAL' || String(get('owner')).toUpperCase() !== this.config.providerRole!.toUpperCase()) return { status: 'blocked', message: 'The configured package must be externally distributable and owned by the provider role.' };
      // Approved versions alone are insufficient: the default release directive must point at one.
      const versions = await this.executor.execute(`SHOW VERSIONS IN APPLICATION PACKAGE ${identifier(appPackage)}`);
      const channelsEnabled = String(get('release_channels') ?? get('release-channels')).toUpperCase() === 'ENABLED';
      const directives = await this.executor.execute(`SHOW RELEASE DIRECTIVES IN APPLICATION PACKAGE ${identifier(appPackage)}${channelsEnabled ? ' FOR RELEASE CHANNEL DEFAULT' : ''}`);
      const ready = directives.some(directive => (!channelsEnabled || String(field(directive, 'release_channel_name') ?? field(directive, 'release_channel')).toUpperCase() === 'DEFAULT') && String(field(directive, 'name')).toUpperCase() === 'DEFAULT' && String(field(directive, 'release_status')).toUpperCase() === 'DEPLOYED' && versions.some(version => String(field(version, 'version')) === String(field(directive, 'version')) && String(field(version, 'patch')) === String(field(directive, 'patch')) && String(field(version, 'review_status')).toUpperCase() === 'APPROVED'));
      if (!ready) return { status: 'blocked', message: 'An approved version and verified default release directive are required. Release-channel packages require provider review if this preflight cannot verify readiness.' };
      const name = resourceName(this.config, binding, 'APP');
      const operations = this.prepare(binding);
      const yaml = manifest(this.config, binding, 'Unity Analytics Native App', { refresh_type: 'SUB_DATABASE_WITH_REFERENCE_USAGE' }, appDetails);
      const state = await reconcileListing(this.executor, name, 'application_package', appPackage, yaml, name, this.config.providerRole!);
      const status = await executeListing(this.executor, operations, state, publish);
      return { status, listingName: name, message: status === 'published' ? 'Private listing published. Consumer fulfillment and installation are separate.' : 'Private listing prepared as a draft; not shared yet.' };
    } catch (error) { console.error('[native-app] delivery blocked:', error instanceof Error ? error.message : error); return { status: 'blocked', message: 'Native App delivery blocked. Check trusted identity, provider ownership, package readiness, and listing conflicts.' }; }
  }
  async remove(binding: TrustedBinding): Promise<ProductResult> {
    try {
      assertLive(this.config, binding);
      const name = resourceName(this.config, binding, 'APP');
      const dropped = await dropOwned(this.executor, 'LISTING', name, name, this.config.providerRole!);
      return { status: 'removed', listingName: name, message: dropped ? 'Native App listing deleted. The application package is kept.' : 'No Native App listing to delete.' };
    } catch (error) { console.error('[native-app] removal blocked:', error instanceof Error ? error.message : error); return { status: 'blocked', message: 'Native App listing could not be deleted. Check the API server log.' }; }
  }
}