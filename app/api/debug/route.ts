import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'Cache-Control': 'no-cache',
};

async function tryFetch(url: string) {
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  const text = await res.text();
  const isCloudflare = text.includes('Please enable JS') || text.includes('cf-ray') || text.includes('_cf_chl');
  return {
    url,
    status: res.status,
    ok: res.ok && !isCloudflare,
    isCloudflareBlock: isCloudflare,
    bodyLength: text.length,
    preview: text.slice(0, 300),
    rawText: text, // 只內部使用
  };
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  // ── 測試各種 Hermes URL 是否可直接存取 ──────────────────────────
  const urlsToTest = [
    'https://www.hermes.com/tw/zh/',
    'https://www.hermes.com/tw/zh/maison-hermes/nouvelles-entrees/',
    'https://www.hermes.com/sitemap.xml',
    'https://www.hermes.com/tw/zh/sitemap.xml',
    // 試試看直接抓個別產品頁（Birkin 25）
    'https://www.hermes.com/tw/zh/product/birkin-25-bag-H084300CKAA/',
  ];

  for (const url of urlsToTest) {
    try {
      const r = await tryFetch(url);
      results.push({
        url: r.url,
        status: r.status,
        accessible: r.ok,
        cloudflareBlock: r.isCloudflareBlock,
        bodyLength: r.bodyLength,
        preview: r.preview,
      });
    } catch (e) {
      results.push({ url, error: String(e) });
    }
  }

  // ── 解析首頁內的包款連結 ──────────────────────────────────────────
  try {
    const home = await tryFetch('https://www.hermes.com/tw/zh/');
    if (home.ok) {
      const html = home.rawText;
      // 找出所有 /tw/zh/ 路徑連結
      const allLinks = [...html.matchAll(/href="(\/tw\/zh\/[^"]+)"/g)].map(m => m[1]);
      // 過濾出像是產品頁的連結（包含 product 或 /tw/zh/ 下 5 段以上路徑）
      const bagLinks = allLinks.filter(l =>
        l.includes('/product/') ||
        (l.split('/').length >= 7 && !l.includes('/category/') && !l.includes('/maison'))
      );
      const uniqueBagLinks = [...new Set(bagLinks)];
      results.push({
        test: '首頁包款連結',
        totalLinks: allLinks.length,
        bagLinkCount: uniqueBagLinks.length,
        sampleBagLinks: uniqueBagLinks.slice(0, 10),
      });
    }
  } catch (e) {
    results.push({ test: '首頁解析', error: String(e) });
  }

  return NextResponse.json(results, { status: 200 });
}
