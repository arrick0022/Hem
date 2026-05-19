import { Redis } from '@upstash/redis';
import type { Product } from './scraper';

// 延遲初始化，避免建置時找不到環境變數
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

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
  const data = await getRedis().get<Record<string, Product>>(KEYS.knownProducts);
  return data ?? {};
}

export async function saveKnownProducts(
  products: Record<string, Product>
): Promise<void> {
  await getRedis().set(KEYS.knownProducts, products);
}

// ─── New Products History ─────────────────────────────────────────────────

export async function getNewHistory(): Promise<Product[]> {
  const data = await getRedis().get<Product[]>(KEYS.newHistory);
  return data ?? [];
}

export async function appendNewProducts(products: Product[]): Promise<void> {
  const existing = await getNewHistory();
  // 最新的排前面，最多保留 200 筆
  const updated = [...products, ...existing].slice(0, 200);
  await getRedis().set(KEYS.newHistory, updated);
}

// ─── Stats ────────────────────────────────────────────────────────────────

export async function getStats(): Promise<CheckStats> {
  const data = await getRedis().get<CheckStats>(KEYS.stats);
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
  await getRedis().set(KEYS.stats, updated);
}
