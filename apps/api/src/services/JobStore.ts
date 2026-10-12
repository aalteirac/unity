import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Job } from '@portal/contracts';
// Single-process local prototype. Replace with transactional storage before scaling.
export class JobStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {}
  async all(): Promise<Job[]> {
    await this.queue;
    try { return JSON.parse(await readFile(this.path, 'utf8')) as Job[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('Local job store cannot be read.'); }
  }
  save(job: Job): Promise<void> {
    const operation = this.queue.then(async () => {
      let jobs: Job[];
      try { jobs = JSON.parse(await readFile(this.path, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Local job store cannot be read.'); jobs = []; }
      const next = jobs.filter(item => item.id !== job.id); next.push(job);
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await writeFile(`${this.path}.next`, JSON.stringify(next), { mode: 0o600 });
      await rename(`${this.path}.next`, this.path);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}