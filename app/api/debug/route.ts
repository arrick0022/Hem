import { NextRequest, NextResponse } from 'next/server';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'Cache-Control': 'no-cache',
};

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown>[] = [];

  const testUrls = [
    { label: '女士包款', url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/' },
    { label: '男士包款', url: 'https://www.hermes.com/tw/zh/category/men/bags-and-small-leather-goods/bags/' },
    { label: '女士皮件', url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/small-leather-goods/' },
  ];

  for (const target of testUrls) {
    try {
      const res = await fetch(target.url, {
        headers: BROWSER_HEADERS,
        cache: 'no-store',
      });
      const text = await res.text();

      // 嘗試從 HTML 找出產品連結數量
      const productLinks = (text.match(/href="\/tw\/zh\/[^"]+\/[^"]{5,}"/g) ?? []).length;
      const hasNextData = text.includes('__NEXT_DATA__');
      const buildIdMatch = text.match(/"buildId"\s*:\s*"([^"]+)"/);

      results.push({
        label: target.label,
        url: target.url,
        status: res.status,
        ok: res.ok,
        bodyLength: text.length,
        hasNextData,
        buildId: buildIdMatch?.[1] ?? '(not found)',
        productLinks,
        // 顯示 HTML 片段（檢查是不是真實內容還是 Cloudflare 攔截頁）
        preview: text.slice(0, 500),
      });

      if (res.ok) break; // 找到能用的就停止
    } catch (e) {
      results.push({ label: target.label, error: String(e) });
    }
  }

  return NextResponse.json(results, { status: 200 });
}
