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

const HERMES_TARGETS = [
  {
    url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/',
    category: '女士包款',
  },
  {
    url: 'https://www.hermes.com/tw/zh/category/men/bags/',
    category: '男士包款',
  },
  {
    url: 'https://www.hermes.com/tw/zh/maison-hermes/nouvelles-entrees/',
    category: '最新上架',
  },
];

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

async function scrapePage(url: string, category: string): Promise<Product[]> {
  const products: Product[] = [];

  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.warn(`[scraper] ${url} returned ${res.status}`);
      return products;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // ── 方法 1：Next.js __NEXT_DATA__ ──────────────────────────────
    const nextRaw = $('#__NEXT_DATA__').text();
    if (nextRaw) {
      try {
        const nextData = JSON.parse(nextRaw);
        const pageProps = nextData?.props?.pageProps ?? {};

        // Hermes 可能把商品放在不同路徑
        const candidates: unknown[] =
          pageProps?.products ??
          pageProps?.items ??
          pageProps?.data?.products ??
          pageProps?.category?.products ??
          [];

        if (Array.isArray(candidates) && candidates.length > 0) {
          for (const item of candidates as Record<string, unknown>[]) {
            const id = String(item.id ?? item.sku ?? item.objectID ?? '');
            const name = String(item.name ?? item.title ?? item.displayName ?? '');
            const slug = String(item.slug ?? item.url ?? item.href ?? '');
            if (!id || !name) continue;

            const productUrl = slug.startsWith('http')
              ? slug
              : `https://www.hermes.com${slug}`;

            const priceObj = item.price as Record<string, unknown> | undefined;
            const price = priceObj?.value
              ? `${priceObj.value} ${priceObj.currency ?? 'TWD'}`
              : undefined;

            const images = item.images as Array<{ url?: string }> | undefined;
            const image =
              images?.[0]?.url ?? (item.image as string | undefined);

            products.push({
              id,
              name,
              url: productUrl,
              price,
              image,
              category,
              firstSeen: new Date().toISOString(),
            });
          }
          return products;
        }
      } catch {
        // JSON 解析失敗，繼續嘗試下一個方法
      }
    }

    // ── 方法 2：解析 HTML 中的商品連結 ────────────────────────────
    const seen = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      // 只抓包款商品頁，排除分類/靜態頁
      if (
        !href.includes('/tw/zh/') ||
        href.includes('/category/') ||
        href.includes('/maison-') ||
        href.length < 20
      )
        return;

      const fullUrl = href.startsWith('http')
        ? href
        : `https://www.hermes.com${href}`;

      // 用 URL 最後一段當 id
      const segments = href.replace(/\/$/, '').split('/');
      const id = segments[segments.length - 1];
      if (!id || seen.has(id)) return;
      seen.add(id);

      const nameEl = $(el).find(
        'h2, h3, [class*="name"], [class*="title"], [class*="product"]'
      );
      const name =
        nameEl.first().text().trim() ||
        $(el).attr('title') ||
        $(el).text().trim().slice(0, 80);

      if (!name || name.length < 3) return;

      const imgEl = $(el).find('img');
      const image = imgEl.attr('src') ?? imgEl.attr('data-src') ?? undefined;

      products.push({
        id,
        name,
        url: fullUrl,
        image,
        category,
        firstSeen: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error(`[scraper] fetch error for ${url}:`, err);
  }

  return products;
}

export async function scrapeAllBags(): Promise<Product[]> {
  const all: Product[] = [];
  const seen = new Set<string>();

  for (const target of HERMES_TARGETS) {
    const products = await scrapePage(target.url, target.category);
    for (const p of products) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        all.push(p);
      }
    }
  }

  return all;
}
