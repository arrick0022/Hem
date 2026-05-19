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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

// Hermes 台灣 Sitemap 位置
const SITEMAP_URLS = [
  'https://www.hermes.com/tw/zh/sitemap.xml',
  'https://www.hermes.com/sitemap.xml',
  'https://www.hermes.com/sitemap_index.xml',
];

// 包款關鍵字（英文/法文）
const BAG_KEYWORDS = [
  'bag', 'sac', 'birkin', 'kelly', 'constance', 'lindy', 'picotin',
  'bolide', 'herbag', 'evelyne', 'garden', 'roulis', 'halzan',
  'leather', 'clutch', 'tote', 'backpack', 'mini',
];

function isBagUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return BAG_KEYWORDS.some((k) => lower.includes(k));
}

function urlToName(url: string): string {
  const segments = url.replace(/\/$/, '').split('/');
  const last = segments[segments.length - 1]
    .replace(/\.html$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return last || url;
}

// ── 方法 1：掃描 Sitemap ────────────────────────────────────────

async function scrapeFromSitemap(): Promise<Product[]> {
  for (const sitemapUrl of SITEMAP_URLS) {
    try {
      const res = await fetch(sitemapUrl, { headers: FETCH_HEADERS, cache: 'no-store' });
      if (!res.ok) {
        console.log(`[sitemap] ${sitemapUrl} → ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const products = parseSitemap(xml);

      if (products.length > 0) {
        console.log(`[sitemap] Found ${products.length} bag products from ${sitemapUrl}`);
        return products;
      }

      // 如果是 sitemap index，解析子 sitemap
      const $ = cheerio.load(xml, { xmlMode: true });
      const subSitemaps: string[] = [];
      $('sitemap loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc.includes('tw') || loc.includes('product') || loc.includes('catalog')) {
          subSitemaps.push(loc);
        }
      });

      for (const sub of subSitemaps.slice(0, 5)) {
        const subRes = await fetch(sub, { headers: FETCH_HEADERS, cache: 'no-store' });
        if (!subRes.ok) continue;
        const subXml = await subRes.text();
        const subProducts = parseSitemap(subXml);
        if (subProducts.length > 0) {
          console.log(`[sitemap] Found ${subProducts.length} from sub-sitemap ${sub}`);
          return subProducts;
        }
      }
    } catch (err) {
      console.warn(`[sitemap] Error: ${sitemapUrl}`, err);
    }
  }
  return [];
}

function parseSitemap(xml: string): Product[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const products: Product[] = [];
  const seen = new Set<string>();

  $('url loc').each((_, el) => {
    const url = $(el).text().trim();

    // 只要台灣站包款 URL
    if (!url.includes('/tw/zh/') && !url.includes('hermes.com/tw')) return;
    if (!isBagUrl(url)) return;

    const segments = url.replace(/\/$/, '').split('/');
    const id = segments[segments.length - 1].replace(/\.html$/, '');
    if (!id || id.length < 3 || seen.has(id)) return;
    seen.add(id);

    // 嘗試從 <image:loc> 取封面圖
    const img = $(el).parent().find('image\\:loc, loc').last().text().trim();
    const image = img !== url ? img : undefined;

    products.push({
      id,
      name: urlToName(url),
      url,
      image,
      category: '包款',
      firstSeen: new Date().toISOString(),
    });
  });

  return products;
}

// ── 方法 2：直接爬取頁面 HTML（備援）──────────────────────────

const PAGE_TARGETS = [
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/', category: '女士包款' },
  { url: 'https://www.hermes.com/tw/zh/category/men/bags/', category: '男士包款' },
  { url: 'https://www.hermes.com/tw/zh/maison-hermes/nouvelles-entrees/', category: '最新上架' },
];

async function scrapeFromPages(): Promise<Product[]> {
  const all: Product[] = [];
  const seen = new Set<string>();

  for (const target of PAGE_TARGETS) {
    try {
      const res = await fetch(target.url, { headers: FETCH_HEADERS, cache: 'no-store' });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // 嘗試 __NEXT_DATA__
      const nextRaw = $('#__NEXT_DATA__').text();
      if (nextRaw) {
        try {
          const nextData = JSON.parse(nextRaw);
          const list = findArraysWithProducts(nextData);
          for (const item of list) {
            const id = String(item.id ?? item.sku ?? item.objectID ?? '');
            const name = String(item.name ?? item.title ?? '');
            if (!id || !name) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            const slug = String(item.slug ?? item.url ?? '');
            all.push({
              id, name,
              url: slug.startsWith('http') ? slug : `https://www.hermes.com${slug}`,
              category: target.category,
              firstSeen: new Date().toISOString(),
            });
          }
        } catch { /* ignore */ }
      }

      // HTML 連結備援
      $('a[href*="/tw/zh/"]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        if (!isBagUrl(href)) return;
        const id = href.replace(/\/$/, '').split('/').pop()?.replace(/\.html$/, '') ?? '';
        if (!id || id.length < 3 || seen.has(id)) return;
        const name = $(el).find('h2,h3,[class*="name"],[class*="title"]').first().text().trim();
        if (!name) return;
        seen.add(id);
        all.push({
          id, name,
          url: `https://www.hermes.com${href}`,
          category: target.category,
          firstSeen: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.warn(`[pages] Error: ${target.url}`, err);
    }
  }

  return all;
}

function findArraysWithProducts(obj: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    const hit = obj.filter(
      (i) => i && typeof i === 'object' && !Array.isArray(i) &&
        ('id' in i || 'sku' in i) && ('name' in i || 'title' in i)
    );
    if (hit.length > 0) return hit as Record<string, unknown>[];
    return obj.flatMap((i) => findArraysWithProducts(i, depth + 1));
  }
  return Object.values(obj as object).flatMap((v) => findArraysWithProducts(v, depth + 1));
}

// ── 主函式 ─────────────────────────────────────────────────────

export async function scrapeAllBags(): Promise<Product[]> {
  // 優先用 Sitemap
  const sitemapProducts = await scrapeFromSitemap();
  if (sitemapProducts.length > 0) return sitemapProducts;

  // 備援：直接爬頁面
  console.log('[scraper] Sitemap empty, falling back to page scraping');
  const pageProducts = await scrapeFromPages();
  console.log(`[scraper] Page scraping found ${pageProducts.length}`);
  return pageProducts;
}
