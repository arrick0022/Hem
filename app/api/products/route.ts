import { NextResponse } from 'next/server';
import { getNewHistory, getStats } from '@/lib/storage';

export async function GET() {
  try {
    const [history, stats] = await Promise.all([getNewHistory(), getStats()]);
    return NextResponse.json({ history, stats });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch data', detail: String(err) },
      { status: 500 }
    );
  }
}
