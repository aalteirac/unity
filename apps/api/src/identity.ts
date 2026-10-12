import { randomBytes } from 'node:crypto';
import type { DemoIdentity } from '@portal/contracts';
export const identities: DemoIdentity[] = [
  { id: 'studio-north', unityId: 'unity_demo_north', name: 'Alex Morgan', organization: 'Northstar Games', initials: 'AM', projects: ['Skybound', 'Neon Drift', 'Tiny Kingdom'] },
  { id: 'studio-orbit', unityId: 'unity_demo_orbit', name: 'Sam Rivera', organization: 'Orbit Interactive', initials: 'SR', projects: ['Lunar Quest', 'Starfall'] },
  { id: 'studio-pixel', unityId: 'unity_demo_pixel', name: 'Jordan Lee', organization: 'Pixel Foundry', initials: 'JL', projects: ['Pixel Garden', 'Dungeon Run'] }
];
type Session = { identity: DemoIdentity; expires: number };
const sessions = new Map<string, Session>();
export function createSession(identityId: string) {
  for (const [id, session] of sessions) if (session.expires < Date.now()) sessions.delete(id);
  const identity = identities.find(item => item.id === identityId);
  if (!identity) throw new Error('Unknown demo identity.');
  const id = randomBytes(32).toString('hex');
  sessions.set(id, { identity, expires: Date.now() + 8 * 60 * 60 * 1000 });
  return { id, identity };
}
export function getSession(cookie: string | undefined) {
  const id = cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('portal_session='))?.slice('portal_session='.length);
  const session = id ? sessions.get(id) : undefined;
  if (!id || !session || session.expires < Date.now()) throw new Error('Select a demo Unity identity to continue.');
  return { id, identity: session.identity };
}
export function previewFor(identity: DemoIdentity) {
  return identity.projects.map((project, index) => ({ project, activePlayers: [12840, 8320, 4150][index], revenue: [24600, 18200, 7900][index] }));
}
export type TrustedBinding = { kind: 'trusted'; unityId: string; account: string; approvedAccount: string };
export function requireTrustedBinding(binding: { kind: string; account: string; unityId: string; approvedAccount?: string }): asserts binding is TrustedBinding {
  const account = normalizeTrusted(binding.account);
  if (binding.kind !== 'trusted' || !binding.unityId || !account || account !== binding.approvedAccount) throw new Error('Live delivery requires a trusted Unity identity and approved recipient binding.');
}
function normalizeTrusted(account: string) { return /^[A-Z][A-Z0-9]*\.[A-Z][A-Z0-9_]*$/.test(account) ? account : ''; }