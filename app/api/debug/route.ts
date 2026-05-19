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

  const targetUrl = 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/';

  // 測試多種組合，找出哪個能繞過 Cloudflare
  const configs = [
    { label: 'browser=true, no proxy',   params: 'browser=true' },
    { label: 'browser=true, proxy=sg',   params: 'browser=true&proxy_country=sg' },
    { label: 'browser=true, proxy=jp',   params: 'browser=true&proxy_country=jp' },
    { label: 'browser=true, proxy=us',   params: 'browser=true&proxy_country=us' },
    { label: 'browser=true, proxy=gb',   params: 'browser=true&proxy_country=gb' },
  ];

  const results = [];

  for (const cfg of configs) {
    const apiUrl =
      `https://api.scrapingant.com/v2/general?` +
      `url=${encodeURIComponent(targetUrl)}` +
      `&x-api-key=${token}` +
      `&${cfg.params}`;

    try {
      const res = await fetch(apiUrl, { cache: 'no-store' });
      const text = await res.text();
      results.push({
        config: cfg.label,
        status: res.status,
        ok: res.ok,
        bodyLength: text.length,
        hasNextData: text.includes('__NEXT_DATA__'),
        hasProduct: text.includes('product') || text.includes('Product'),
        preview: res.ok ? text.slice(0, 300) : text.slice(0, 200),
      });
      // 找到成功的就停止（省配額）
      if (res.ok && text.length > 10000) break;
    } catch (err) {
      results.push({ config: cfg.label, error: String(err) });
    }
  }

  return NextResponse.json(results, { status: 200 });
}
