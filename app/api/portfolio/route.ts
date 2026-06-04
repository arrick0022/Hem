import { NextResponse } from 'next/server';
import { computePortfolio } from '@/lib/portfolio';

// 每次請求即時計算（含現價抓取），不快取
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await computePortfolio();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to compute portfolio', detail: String(err) },
      { status: 500 }
    );
  }
}
