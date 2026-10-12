import type { ProductResult } from '@portal/contracts';
import { resourceName, type DeliveryBinding } from '../../lib/distribution';
export class MockDataDistributor {
  async deliver(binding: DeliveryBinding): Promise<ProductResult> {
    return { status: 'simulated', listingName: `DEMO_${resourceName({ namespace: 'UNITY_PORTAL' }, binding, 'DATA')}`, message: 'Private data listing simulated, scoped to your demo Unity identity.' };
  }
}