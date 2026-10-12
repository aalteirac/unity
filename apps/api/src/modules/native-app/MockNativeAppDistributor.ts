import type { ProductResult } from '@portal/contracts';
import { resourceName, type DeliveryBinding } from '../../lib/distribution';
export class MockNativeAppDistributor {
  async deliver(binding: DeliveryBinding): Promise<ProductResult> {
    return { status: 'simulated', listingName: `DEMO_${resourceName({ namespace: 'UNITY_PORTAL' }, binding, 'APP')}`, message: 'Private Native App listing simulated. The application is not built yet.' };
  }
}