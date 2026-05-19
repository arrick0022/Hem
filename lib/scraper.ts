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

// 透過 ScrapingAnt 繞過 Cloudflare，取得完整渲染後的 HTML
async function fetchWithScrapingAnt(targetUrl: string): Promise<string> {
  const token = process.env.SCRAPINGANT_TOKEN;
  if (!token) throw new Error('SCRAPINGANT_TOKEN not set');

  const apiUrl = `https://api.scrapingant.com/v2/general?` +
    `url=${encodeURIComponent(targetUrl)}` +
    `&x-api-key=${token}` +
    `&browser=false` +          // 不需要完整瀏覽器，節省配額
    `&proxy_type=datacenter`;

  const res = await fetch(apiUrl, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ScrapingAnt error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.text();
}

// Hermes 台灣監控目標（只監控最重要的頁面，節省 API 配額）
const TARGETS = [
  { url: 'https://www.hermes.com/tw/zh/maison-hermes/nouvelles-entrees/', category: '最新上架' },
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/', category: '女士包款' },
];

function extractProducts(html: string, category: string): Product[] {
  const products: Product[] = [];
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  // 方法 1：Next.js __NEXT_DATA__
  const nextRaw = $('#__NEXT_DATA__').text();
  if (nextRaw) {
    try {
      const data = JSON.parse(nextRaw);
      const list = findProductArrays(data);
      for (const item of list) {
        const p = toProduct(item, category);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          products.push(p);
        }
      }
      if (products.length > 0) {
        console.log(`[scraper] __NEXT_DATA__ → ${products.length} items`);
        return products;
      }
    } catch { /* ignore */ }
  }

  // 方法 2：其他 JSON script tags
  $('script[type="application/json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      const list = findProductArrays(data);
      for (const item of list) {
        const p = toProduct(item, category);
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          products.push(p);
        }
      }
    } catch { /* ignore */ }
  });

  if (products.length > 0) return products;

  // 方法 3：HTML 連結解析
  $('a[href*="/tw/zh/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    // 排除分類頁、靜態頁
    if (href.includes('/category/') || href.split('/').length < 6) return;

    const id = href.replace(/\/$/, '').split('/').pop()?.replace(/\.html$/, '') ?? '';
    if (!id || id.length < 3 || seen.has(id)) return;

    const name =
      $(el).find('[class*="name"],[class*="title"],h2,h3').first().text().trim() ||
      $(el).attr('aria-label') ||
      $(el).attr('title') || '';

    if (!name || name.length < 2) return;
    seen.add(id);

    const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
    const price = $(el).find('[class*="price"]').first().text().trim() || undefined;

    products.push({
      id, name,
      url: href.startsWith('http') ? href : `https://www.hermes.com${href}`,
      image: img || undefined,
      price,
      category,
      firstSeen: new Date().toISOString(),
    });
  });

  return products;
}

function findProductArrays(obj: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    const hit = (obj as unknown[]).filter(
      (i) => i && typeof i === 'object' && !Array.isArray(i) &&
        ('id' in (i as object) || 'sku' in (i as object)) &&
        ('name' in (i as object) || 'title' in (i as object))
    ) as Record<string, unknown>[];
    if (hit.length > 0) return hit;
    return (obj as unknown[]).flatMap((i) => findProductArrays(i, depth + 1));
  }
  return Object.values(obj as object).flatMap((v) => findProductArrays(v, depth + 1));
}

function toProduct(item: Record<string, unknown>, category: string): Product | null {
  const id = String(item.id ?? item.sku ?? item.objectID ?? '');
  const name = String(item.name ?? item.title ?? item.displayName ?? '');
  if (!id || !name || id === 'undefined' || name === 'undefined') return null;

  const slug = String(item.slug ?? item.url ?? item.href ?? '');
  const url = slug.startsWith('http') ? slug : `https://www.hermes.com${slug || '/tw/zh/'}`;

  const priceObj = item.price as Record<string, unknown> | undefined;
  const price = priceObj?.value ? `${priceObj.value} ${priceObj.currency ?? 'TWD'}` : undefined;
  const images = item.images as Array<{ url?: string }> | undefined;
  const image = images?.[0]?.url ?? (item.image as string | undefined);

  return { id, name, url, price, image, category, firstSeen: new Date().toISOString() };
}

export async function scrapeAllBags(): Promise<Product[]> {
  const all: Product[] = [];
  const seen = new Set<string>();

  for (const target of TARGETS) {
    try {
      console.log(`[scraper] Fetching via ScrapingAnt: ${target.url}`);
      const html = await fetchWithScrapingAnt(target.url);
      console.log(`[scraper] Got ${html.length} bytes`);

      const products = extractProducts(html, target.category);
      console.log(`[scraper] Extracted ${products.length} products`);

      for (const p of products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          all.push(p);
        }
      }
    } catch (err) {
      console.error(`[scraper] Failed for ${target.url}:`, err);
    }
  }

  return all;
}
