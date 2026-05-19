import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.SCRAPINGANT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'SCRAPINGANT_TOKEN not set' }, { status: 500 });
  }

  const bagsUrl = 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/';
  const results: Record<string, unknown>[] = [];

  // ── 測試 1：ScrapingAnt 住宅代理（residential）──────────────────────
  const residentialConfigs = [
    { label: 'residential, browser=true, no country',  params: 'browser=true&proxy_type=residential' },
    { label: 'residential, browser=true, proxy=us',    params: 'browser=true&proxy_type=residential&proxy_country=us' },
    { label: 'residential, browser=false, proxy=us',   params: 'browser=false&proxy_type=residential&proxy_country=us' },
  ];

  for (const cfg of residentialConfigs) {
    const apiUrl =
      `https://api.scrapingant.com/v2/general?` +
      `url=${encodeURIComponent(bagsUrl)}&x-api-key=${token}&${cfg.params}`;
    try {
      const res = await fetch(apiUrl, { cache: 'no-store' });
      const text = await res.text();
      results.push({
        test: cfg.label,
        status: res.status,
        ok: res.ok,
        bodyLength: text.length,
        hasNextData: text.includes('__NEXT_DATA__'),
        hasProduct: text.includes('product'),
        preview: text.slice(0, 200),
      });
      if (res.ok && text.length > 10000) break;
    } catch (e) {
      results.push({ test: cfg.label, error: String(e) });
    }
  }

  // ── 測試 2：直接抓 Hermes 內部 Next.js JSON API（不用 ScrapingAnt）──
  // 先嘗試取得首頁的 buildId
  let buildId = '';
  try {
    const homeRes = await fetch('https://www.hermes.com/tw/zh/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
      },
      cache: 'no-store',
    });
    const homeHtml = await homeRes.text();
    const match = homeHtml.match(/"buildId"\s*:\s*"([^"]+)"/);
    buildId = match?.[1] ?? '';
    results.push({
      test: 'direct fetch homepage',
      status: homeRes.status,
      bodyLength: homeHtml.length,
      buildId: buildId || '(not found)',
      hasNextData: homeHtml.includes('__NEXT_DATA__'),
    });
  } catch (e) {
    results.push({ test: 'direct fetch homepage', error: String(e) });
  }

  // 如果拿到 buildId，試著呼叫 Next.js 資料端點（純 JSON，不需要 JS 渲染）
  if (buildId) {
    const dataUrl = `https://www.hermes.com/_next/data/${buildId}/tw/zh/category/women/bags-and-small-leather-goods/bags.json`;
    try {
      const dataRes = await fetch(dataUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.hermes.com/tw/zh/',
        },
        cache: 'no-store',
      });
      const dataText = await dataRes.text();
      results.push({
        test: 'Next.js data API (no ScrapingAnt)',
        dataUrl,
        status: dataRes.status,
        ok: dataRes.ok,
        bodyLength: dataText.length,
        hasProducts: dataText.includes('product') || dataText.includes('sku'),
        preview: dataText.slice(0, 400),
      });
    } catch (e) {
      results.push({ test: 'Next.js data API', error: String(e) });
    }
  }

  return NextResponse.json(results, { status: 200 });
}
