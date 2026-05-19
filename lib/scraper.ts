import * as cheerio from 'cheerio';

export interface Product {
  id: string;
  name: string;
  url: string;
  price?: string;
  image?: string;
  category: string;
  firstSeen: string;
}

// Hermes 台灣各類包款頁面
const HERMES_TARGETS = [
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/', category: '女士包款' },
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/', category: '女士皮革小物' },
  { url: 'https://www.hermes.com/tw/zh/category/men/bags/', category: '男士包款' },
  { url: 'https://www.hermes.com/tw/zh/maison-hermes/nouvelles-entrees/', category: '最新上架' },
];

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

// Hermes 商品 URL 特徵（台灣站）
const PRODUCT_URL_REGEX = /\/tw\/zh\/(?!category|maison|search|story|content|media)[\w-]+\/[\w-]+\/[\w-]+/;

async function scrapePage(url: string, category: string): Promise<Product[]> {
  const products: Product[] = [];

  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(`[scraper] ${url} → HTTP ${res.status}`);
      return products;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // ── 方法 1：Next.js __NEXT_DATA__ ──────────────────────────────
    const nextRaw = $('#__NEXT_DATA__').text();
    if (nextRaw) {
      try {
        const nextData = JSON.parse(nextRaw);
        // 遞迴搜尋所有可能包含商品陣列的路徑
        const productList = findProductsInObject(nextData);
        if (productList.length > 0) {
          for (const item of productList) {
            const p = normalizeProduct(item, category);
            if (p) products.push(p);
          }
          console.log(`[scraper] __NEXT_DATA__ found ${products.length} products at ${url}`);
          return products;
        }
      } catch {
        // ignore
      }
    }

    // ── 方法 2：搜尋其他 JSON script tags ─────────────────────────
    $('script[type="application/json"], script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        const list = findProductsInObject(data);
        for (const item of list) {
          const p = normalizeProduct(item, category);
          if (p) products.push(p);
        }
      } catch {
        // ignore
      }
    });

    if (products.length > 0) {
      console.log(`[scraper] JSON scripts found ${products.length} products at ${url}`);
      return products;
    }

    // ── 方法 3：解析 HTML 連結（提取商品 URL）────────────────────
    const seen = new Set<string>();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';

      // 只抓符合商品 URL 格式的連結
      if (!PRODUCT_URL_REGEX.test(href)) return;

      const fullUrl = href.startsWith('http') ? href : `https://www.hermes.com${href}`;
      const segments = href.replace(/\/$/, '').split('/');
      const id = segments[segments.length - 1];
      if (!id || id.length < 3 || seen.has(id)) return;
      seen.add(id);

      // 嘗試取得商品名稱
      const nameEl = $(el).find('[class*="name"],[class*="title"],[class*="product"],h2,h3,p').first();
      const name = nameEl.text().trim()
        || $(el).attr('aria-label')
        || $(el).attr('title')
        || '';

      if (!name || name.length < 2) return;

      const imgEl = $(el).find('img');
      const image = imgEl.attr('src') || imgEl.attr('data-src') || undefined;

      const priceEl = $(el).find('[class*="price"],[class*="amount"]').first();
      const price = priceEl.text().trim() || undefined;

      products.push({
        id,
        name,
        url: fullUrl,
        image,
        price,
        category,
        firstSeen: new Date().toISOString(),
      });
    });

    console.log(`[scraper] HTML parse found ${products.length} products at ${url}`);
  } catch (err) {
    console.error(`[scraper] Error fetching ${url}:`, err);
  }

  return products;
}

// 遞迴搜尋 JSON 物件中的商品陣列
function findProductsInObject(obj: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || !obj || typeof obj !== 'object') return [];

  const results: Record<string, unknown>[] = [];

  if (Array.isArray(obj)) {
    // 如果陣列裡的元素看起來像商品
    const candidates = obj.filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item) &&
        ('id' in item || 'sku' in item || 'objectID' in item) &&
        ('name' in item || 'title' in item || 'displayName' in item)
    ) as Record<string, unknown>[];

    if (candidates.length > 0) return candidates;

    // 繼續往下找
    for (const item of obj) {
      results.push(...findProductsInObject(item, depth + 1));
    }
  } else {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // 跳過不相關的 key
      if (['__esModule', 'buildId', 'runtimeConfig'].includes(key)) continue;
      results.push(...findProductsInObject(value, depth + 1));
    }
  }

  return results;
}

// 將原始商品資料標準化
function normalizeProduct(item: Record<string, unknown>, category: string): Product | null {
  const id = String(item.id ?? item.sku ?? item.objectID ?? '');
  const name = String(item.name ?? item.title ?? item.displayName ?? '');
  if (!id || !name || id === 'undefined' || name === 'undefined') return null;

  const slug = String(item.slug ?? item.url ?? item.href ?? item.path ?? '');
  const productUrl = slug.startsWith('http') ? slug : `https://www.hermes.com${slug || `/tw/zh/${id}`}`;

  const priceObj = item.price as Record<string, unknown> | undefined;
  const price = priceObj?.value ? `${priceObj.value} ${priceObj.currency ?? 'TWD'}` : undefined;

  const images = item.images as Array<{ url?: string }> | undefined;
  const image = images?.[0]?.url ?? (item.image as string | undefined) ?? (item.imageUrl as string | undefined);

  return { id, name, url: productUrl, price, image, category, firstSeen: new Date().toISOString() };
}

export async function scrapeAllBags(): Promise<Product[]> {
  const all: Product[] = [];
  const seen = new Set<string>();

  for (const target of HERMES_TARGETS) {
    try {
      const products = await scrapePage(target.url, target.category);
      for (const p of products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          all.push(p);
        }
      }
    } catch (err) {
      console.error(`[scraper] Target failed: ${target.url}`, err);
    }
  }

  console.log(`[scraper] Total scraped: ${all.length}`);
  return all;
}
