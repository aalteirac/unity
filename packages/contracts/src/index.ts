import { z } from 'zod';
export const accountInputSchema = z.object({ input: z.string().trim().min(1).max(512) }).strict();
export const sessionInputSchema = z.object({ identityId: z.enum(['studio-north', 'studio-orbit', 'studio-pixel']) }).strict();
export const deliveryInputSchema = z.object({ account: z.string().min(3).max(128), failProduct: z.enum(['nativeApp', 'data']).optional() }).strict();
export type Product = 'nativeApp' | 'data';
export type ProductResult = { status: 'simulated' | 'failed' | 'not_configured' | 'blocked' | 'draft' | 'published' | 'removed'; message: string; listingName?: string };
export type Job = { id: string; sessionId: string; unityId: string; account: string; mode: 'mock' | 'dry-run' | 'live-test'; createdAt: string; products: Record<Product, ProductResult> };
export type DemoIdentity = { id: string; unityId: string; name: string; organization: string; initials: string; projects: string[] };
export type Operation = { label: string; sql: string; phase: 'prepare' | 'publish' };