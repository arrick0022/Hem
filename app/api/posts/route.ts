import { NextResponse } from 'next/server';
import { getLatestPosts } from '@/lib/truth';
import { analyzePost } from '@/lib/analyze';
import { getQuote, getHistoricalClose } from '@/lib/prices';
import { translateToZh } from '@/lib/translate';

export const dynamic = 'force-dynamic';

interface Reaction {
  ticker: string;
  sincePct: number | null; // 自貼文當日收盤至今的漲跌%
}

const round = (n: number) => Math.round(n * 100) / 100;

// 計算某 ticker 自指定日期收盤至今的漲跌%
async function reactionSince(ticker: string, date: string): Promise<number | null> {
  const [nowQ, base] = await Promise.all([
    getQuote(ticker),
    getHistoricalClose(ticker, date),
  ]);
  if (!nowQ || base === null || base <= 0) return null;
  return round(((nowQ.price - base) / base) * 100);
}

export async function GET() {
  try {
    const raw = await getLatestPosts(8);

    const posts = await Promise.all(
      raw.map(async (p) => {
        const analysis = analyzePost(p.text);
        const date = p.createdAt.slice(0, 10);
        // 大盤 + 被點名個股（上限 3 檔，避免過多請求）
        const tickers = ['SPY', ...analysis.tickers.slice(0, 3)];
        const [reactions, textZh] = await Promise.all([
          Promise.all(
            tickers.map(async (t) => ({ ticker: t, sincePct: await reactionSince(t, date) }))
          ) as Promise<Reaction[]>,
          translateToZh(p.text),
        ]);
        return { ...p, analysis, reactions, textZh };
      })
    );

    return NextResponse.json({
      asOf: new Date().toISOString(),
      live: posts.length > 0,
      posts,
    });
  } catch (err) {
    return NextResponse.json(
      { asOf: new Date().toISOString(), live: false, posts: [], error: String(err) },
      { status: 200 }
    );
  }
}
