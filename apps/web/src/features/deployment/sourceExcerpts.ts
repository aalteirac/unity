import nativeAppSource from '../../../../api/src/modules/native-app/NativeAppListingDistributor.ts?raw';
import dataSource from '../../../../api/src/modules/data-sharing/UnityDataListingDistributor.ts?raw';
import listingSource from '../../../../api/src/lib/distribution.ts?raw';
import onboardingSource from '../../../../api/src/services/OnboardingService.ts?raw';
import { extractExcerpt } from './extractExcerpt';

// Only these repository files are included as presentation evidence; no runtime file endpoint.
export const sourceExcerpts = [
  { id: 'native-app', title: 'Native App delivery stays in its own module', description: 'A small preparation method attaches the configured package to a private listing. The separate deliver() method performs readiness and ownership checks.', ...extractExcerpt(nativeAppSource, 'apps/api/src/modules/native-app/NativeAppListingDistributor.ts', '  prepare(binding:', '  async deliver(') },
  { id: 'data', title: 'Data is filtered before it is shared', description: 'The query fixes the Unity ID, then the share gets usage plus SELECT on the secure view only. The unfiltered source table is not granted to the share.', ...extractExcerpt(dataSource, 'apps/api/src/modules/data-sharing/UnityDataListingDistributor.ts', '    const select =', '  async deliver(') },
  { id: 'listings', title: 'Draft now. Publish explicitly.', description: 'Both products use the same low-level helper. Creation is a draft; publication is a distinct operation, executed only on explicit opt-in.', ...extractExcerpt(listingSource, 'apps/api/src/lib/distribution.ts', 'export function listingOperations(', 'export function assertLive(') },
  { id: 'retry', title: 'Retry just the failed product', description: 'The demo orchestration checks the stored product status and updates only that product. In live-test mode the same retry re-runs only that product draft delivery; it is not a production queue.', ...extractExcerpt(onboardingSource, 'apps/api/src/services/OnboardingService.ts', '  async retry(', '    });', 2) }
];