import { NextRequest, NextResponse } from 'next/server';
import { scrapeAllBags } from '@/lib/scraper';
import {
  getKnownProducts,
  saveKnownProducts,
  appendNewProducts,
  updateStats,
} from '@/lib/storage';
import { sendNewProductsEmail } from '@/lib/email';

// 保護端點：cron-job.org 呼叫時帶上 secret
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  if (secret && secret === process.env.CRON_SECRET) return true;

  // 也接受 URL 參數（方便測試）
  const urlSecret = req.nextUrl.searchParams.get('secret');
  if (urlSecret && urlSecret === process.env.CRON_SECRET) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[check] Starting Hermes scan...');

    // 1. 爬取目前商品
    const current = await scrapeAllBags();
    console.log(`[check] Scraped ${current.length} products`);

    if (current.length === 0) {
      await updateStats(0);
      return NextResponse.json({
        ok: true,
        message: 'No products found (site may have changed)',
        newCount: 0,
      });
    }

    // 2. 比較已知商品
    const known = await getKnownProducts();
    const newProducts = current.filter((p) => !known[p.id]);

    console.log(`[check] ${newProducts.length} new products found`);

    // 3. 有新品時通知並儲存
    if (newProducts.length > 0) {
      // 寄送 Email
      await sendNewProductsEmail(newProducts);

      // 更新已知清單
      const updatedKnown = { ...known };
      for (const p of newProducts) {
        updatedKnown[p.id] = p;
      }
      await saveKnownProducts(updatedKnown);

      // 記錄歷史
      await appendNewProducts(newProducts);
    }

    // 4. 更新統計
    await updateStats(newProducts.length);

    return NextResponse.json({
      ok: true,
      scanned: current.length,
      newCount: newProducts.length,
      newProducts: newProducts.map((p) => p.name),
      sample: current.slice(0, 3).map((p) => ({ id: p.id, name: p.name })),
    });
  } catch (err) {
    console.error('[check] Error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: String(err) },
      { status: 500 }
    );
  }
}
