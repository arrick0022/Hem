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

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 抓首頁 ────────────────────────────────────────────────────────
  const homeRes = await fetch('https://www.hermes.com/tw/zh/', {
    headers: HEADERS, cache: 'no-store',
  });
  const html = await homeRes.text();

  // ── 1. 找 JSON-LD 結構化資料（Google SEO 用，通常含產品資訊）──────
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const jsonLdData = jsonLdMatches.map(m => {
    try { return JSON.parse(m[1]); } catch { return m[1].slice(0, 200); }
  });

  // ── 2. 找所有 <script src="..."> 外部 JS 檔案 ─────────────────────
  const scriptSrcs = [...html.matchAll(/src="(https?:\/\/[^"]+\.js[^"]*)"/g)].map(m => m[1]);
  const hermesScripts = scriptSrcs.filter(s => s.includes('hermes.com'));

  // ── 3. 找內嵌 API 端點線索 ─────────────────────────────────────────
  const apiPatterns = [
    ...html.matchAll(/["'](https?:\/\/[^"']*api[^"']{3,50})["']/gi),
    ...html.matchAll(/["'](https?:\/\/[^"']*graphql[^"']{0,50})["']/gi),
    ...html.matchAll(/["'](https?:\/\/[^"']*content\.[^"']{3,50})["']/gi),
  ].map(m => m[1]);
  const uniqueApis = [...new Set(apiPatterns)].slice(0, 20);

  // ── 4. 找 window.__STATE__ 或其他全域 JS 物件（含產品資料）──────────
  const stateMatch = html.match(/window\.__(?:STATE|DATA|INITIAL_STATE|STORE)[^=]*=\s*(\{[\s\S]{0,2000})/);
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

  // ── 5. 包款關鍵字出現次數 ──────────────────────────────────────────
  const bagKeywords: Record<string, number> = {};
  for (const kw of ['Birkin', 'Kelly', 'Constance', 'Bolide', 'Picotin', 'Lindy', 'Evelyne', 'Garden Party', '包', 'bag', 'leather']) {
    const count = (html.match(new RegExp(kw, 'gi')) ?? []).length;
    if (count > 0) bagKeywords[kw] = count;
  }

  // ── 6. 找所有 /tw/zh/product/ 連結並分類 ─────────────────────────
  const productLinks = [...new Set([...html.matchAll(/href="(\/tw\/zh\/product\/[^"]+)"/g)].map(m => m[1]))];
  const bagProducts = productLinks.filter(l =>
    /birkin|kelly|constance|bolide|picotin|lindy|evelyne|garden|sac|bag|包|皮/i.test(l)
  );

  return NextResponse.json({
    htmlSize: html.length,
    jsonLdCount: jsonLdData.length,
    jsonLdData: jsonLdData.slice(0, 3),
    hermesScripts: hermesScripts.slice(0, 5),
    apiEndpoints: uniqueApis,
    hasWindowState: !!stateMatch,
    windowStatePreview: stateMatch?.[1]?.slice(0, 500),
    hasNextData: !!nextDataMatch,
    nextDataPreview: nextDataMatch?.[1]?.slice(0, 500),
    bagKeywords,
    totalProductLinks: productLinks.length,
    bagProductLinks: bagProducts,
    allProductLinks: productLinks.slice(0, 15),
  }, { status: 200 });
}
