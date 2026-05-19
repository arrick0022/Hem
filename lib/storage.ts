import { Redis } from '@upstash/redis';
import type { Product } from './scraper';

const redis = Redis.fromEnv();

const KEYS = {
  knownProducts: 'hermes:known_products',
  newHistory: 'hermes:new_history',
  lastCheck: 'hermes:last_check',
  stats: 'hermes:stats',
};

export interface CheckStats {
  totalChecks: number;
  totalNewFound: number;
  lastCheckAt: string;
  lastNewAt?: string;
}

// ─── Known Products ────────────────────────────────────────────────────────

export async function getKnownProducts(): Promise<Record<string, Product>> {
  const data = await redis.get<Record<string, Product>>(KEYS.knownProducts);
  return data ?? {};
}

export async function saveKnownProducts(
  products: Record<string, Product>
): Promise<void> {
  await redis.set(KEYS.knownProducts, products);
}

// ─── New Products History ─────────────────────────────────────────────────

export async function getNewHistory(): Promise<Product[]> {
  const data = await redis.get<Product[]>(KEYS.newHistory);
  return data ?? [];
}

export async function appendNewProducts(products: Product[]): Promise<void> {
  const existing = await getNewHistory();
  // 最新的排前面，最多保留 200 筆
  const updated = [...products, ...existing].slice(0, 200);
  await redis.set(KEYS.newHistory, updated);
}

// ─── Stats ────────────────────────────────────────────────────────────────

export async function getStats(): Promise<CheckStats> {
  const data = await redis.get<CheckStats>(KEYS.stats);
  return (
    data ?? {
      totalChecks: 0,
      totalNewFound: 0,
      lastCheckAt: new Date().toISOString(),
    }
  );
}

export async function updateStats(newCount: number): Promise<void> {
  const stats = await getStats();
  const updated: CheckStats = {
    totalChecks: stats.totalChecks + 1,
    totalNewFound: stats.totalNewFound + newCount,
    lastCheckAt: new Date().toISOString(),
    lastNewAt: newCount > 0 ? new Date().toISOString() : stats.lastNewAt,
  };
  await redis.set(KEYS.stats, updated);
}
