import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const testUrls = [
    'https://www.hermes.com/tw/zh/sitemap.xml',
    'https://www.hermes.com/sitemap.xml',
    'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/',
  ];

  const results = [];

  for (const url of testUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xml,*/*',
        },
        cache: 'no-store',
      });

      const text = await res.text();
      results.push({
        url,
        status: res.status,
        contentType: res.headers.get('content-type'),
        bodyLength: text.length,
        preview: text.slice(0, 300),
      });
    } catch (err) {
      results.push({ url, error: String(err) });
    }
  }

  return NextResponse.json(results, { status: 200 });
}
