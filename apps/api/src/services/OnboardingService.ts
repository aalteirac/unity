import { randomUUID } from 'node:crypto';
import type { Job, Product, ProductResult } from '@portal/contracts';
import { normalizeAccount } from '../lib/accountIdentifier';
import type { DeliveryBinding, Distributor } from '../lib/distribution';
import { MockNativeAppDistributor } from '../modules/native-app/MockNativeAppDistributor';
import { MockDataDistributor } from '../modules/data-sharing/MockDataDistributor';
import { JobStore } from './JobStore';
type MockDistributor = { deliver(binding: DeliveryBinding): Promise<ProductResult> };
export type LiveTest = { distributors: Record<Product, Distributor> };
export class OnboardingService {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private store: JobStore, private mode: Job['mode'], private distributors: Record<Product, MockDistributor> = { nativeApp: new MockNativeAppDistributor(), data: new MockDataDistributor() }, private live?: LiveTest) {
    if (mode === 'live-test' && !live) throw new Error('Live-test mode requires live distributors.');
  }
  private async runLive(product: Product, job: Job, publish: boolean): Promise<ProductResult> {
    // Draft-only: the entered account is targeted, but nothing is published from the portal.
    const binding = { kind: 'trusted' as const, unityId: job.unityId, account: job.account, approvedAccount: job.account };
    try { return await this.live!.distributors[product].deliver(binding, publish); }
    catch { return { status: 'blocked', message: 'Live delivery failed. Check the API server log and retry.' }; }
  }
  private async locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.locks.set(key, current);
    try { return await current; } finally { if (this.locks.get(key) === current) this.locks.delete(key); }
  }
  async get(sessionId: string, id: string) {
    const job = (await this.store.all()).find(item => item.id === id && item.sessionId === sessionId);
    if (!job) throw new Error('Delivery not found for this session.');
    return job;
  }
  async deliver(sessionId: string, unityId: string, rawAccount: string, failProduct?: Product): Promise<Job> {
    const account = normalizeAccount(rawAccount);
    return this.locked(`${sessionId}:${unityId}:${account}`, async () => {
      const existing = (await this.store.all()).find(item => item.sessionId === sessionId && item.unityId === unityId && item.account === account && item.mode === this.mode && !Object.values(item.products).every(product => product.status === 'removed'));
      if (existing) {
        // Recover products persisted as not-started if the local process was interrupted.
        for (const product of ['nativeApp', 'data'] as const) {
          if (existing.products[product].status === 'blocked' && this.mode === 'mock') {
            existing.products[product] = await this.simulate(product, existing);
            await this.store.save(existing);
          }
        }
        return existing;
      }
      const job: Job = { id: randomUUID(), sessionId, unityId, account, mode: this.mode, createdAt: new Date().toISOString(), products: { nativeApp: { status: 'blocked', message: 'Not started.' }, data: { status: 'blocked', message: 'Not started.' } } };
      await this.store.save(job);
      for (const product of ['nativeApp', 'data'] as const) {
        job.products[product] = this.mode === 'live-test' ? await this.runLive(product, job, false) : this.mode === 'dry-run' ? { status: 'draft', message: 'Dry-run preview only. No SQL executed and no listing created.' } : product === failProduct ? { status: 'failed', message: 'Simulated one-time failure. Retry this product to continue.' } : await this.simulate(product, job);
        await this.store.save(job);
      }
      return job;
    });
  }
  private async simulate(product: Product, binding: DeliveryBinding) {
    try { return await this.distributors[product].deliver(binding); }
    catch { return { status: 'failed' as const, message: 'Simulated delivery failed. Retry this product.' }; }
  }
  async remove(sessionId: string, id: string) {
    const found = await this.get(sessionId, id);
    return this.locked(`${sessionId}:${found.unityId}:${found.account}`, async () => {
      const job = await this.get(sessionId, id);
      if (job.mode !== 'live-test' || this.mode !== 'live-test') throw new Error('Delivery not found for live deletion.');
      const binding = { kind: 'trusted' as const, unityId: job.unityId, account: job.account, approvedAccount: job.account };
      for (const product of ['nativeApp', 'data'] as const) {
        if (job.products[product].status === 'removed') continue;
        const distributor = this.live!.distributors[product];
        try { job.products[product] = distributor.remove ? await distributor.remove(binding) : { status: 'blocked', message: 'Deletion is not supported for this product.' }; }
        catch { job.products[product] = { status: 'blocked', message: 'Deletion failed. Check the API server log and retry.' }; }
        await this.store.save(job);
      }
      return job;
    });
  }
  async retry(sessionId: string, id: string, product: Product) {
    const found = await this.get(sessionId, id);
    return this.locked(`${sessionId}:${found.unityId}:${found.account}`, async () => {
      const job = await this.get(sessionId, id);
      if (job.mode === 'live-test' && this.mode === 'live-test') {
        if (!['failed', 'blocked', 'not_configured'].includes(job.products[product].status)) return job;
        job.products[product] = await this.runLive(product, job, false);
      } else {
        if (!['failed', 'blocked'].includes(job.products[product].status) || job.mode !== 'mock') return job;
        job.products[product] = await this.simulate(product, job);
      }
      await this.store.save(job);
      return job;
    });
  }
}