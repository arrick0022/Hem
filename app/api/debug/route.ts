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

  const apiUrl =
    `https://api.scrapingant.com/v2/general?` +
    `url=${encodeURIComponent(targetUrl)}` +
    `&x-api-key=${token}` +
    `&browser=true` +
    `&proxy_country=TW`;

  try {
    const res = await fetch(apiUrl, { cache: 'no-store' });
    const text = await res.text();

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
      bodyLength: text.length,
      // 回傳前 2000 字，看實際 HTML 結構
      preview: text.slice(0, 2000),
      // 看有沒有 __NEXT_DATA__
      hasNextData: text.includes('__NEXT_DATA__'),
      // 看有沒有產品相關關鍵字
      hasProduct: text.includes('product') || text.includes('Product'),
      hasBag: text.includes('bag') || text.includes('Bag') || text.includes('sac'),
      // ScrapingAnt 剩餘配額
      creditsUsed: res.headers.get('x-credits-used'),
      creditsRemaining: res.headers.get('x-credits-remaining'),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
