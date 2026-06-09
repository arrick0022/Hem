// ─────────────────────────────────────────────────────────────────────────
//  川普交易資料
//
//  來源：OGE Form 278-T（Periodic Transaction Report）。
//  交易清單載入自 data/trades.json（單一資料源，可手動編輯）。
//  ※ OGE 官方 PDF 為糊掉的掃描檔、無 ticker，無法可靠自動解析，
//    故採半自動：新季度申報公布後，手動更新 data/trades.json 即可
//    （見 README「更新交易清單」）。push 後 Vercel 會自動重新部署。
//  檔案異常時退回本檔內建的 FALLBACK_TRADES，確保儀表板不中斷。
//
//  注意：
//  - OGE 申報法定延遲約 30–45 天，非即時。
//  - 成本基準由 lib/prices.ts 以建倉日歷史股價計算；現價亦即時抓取。
//    SEED_ENTRY_PRICES 僅作離線退場用的近似值。
// ─────────────────────────────────────────────────────────────────────────

import tradesJson from '@/data/trades.json';

export type Action = 'buy' | 'sell';

export interface DisclosedTrade {
  ticker: string;
  company: string;
  action: Action;
  /** 申報的交易日（OGE 揭露） */
  tradeDate: string;
  /** 揭露金額區間（美元），OGE 不揭露確切金額 */
  amountRange: [number, number];
  /** 申報註記：是否為券商代操 / 主動下單 */
  note?: string;
}

/** 模擬組合「建倉基準日」＝ 2026 年初，等於以年初股價建倉、計算 YTD 損益 */
export const INCEPTION_DATE = '2026-01-01';

/** 虛擬本金 */
export const STARTING_CAPITAL = 100_000;

/** 排除的代號（川普個人控股，佔比 >99%，留著會失去分散意義） */
export const EXCLUDED_TICKERS = new Set(['DJT']);

// ─── 內建退場資料（data/trades.json 異常時使用，確保儀表板不中斷） ──────────
const FALLBACK_TRADES: DisclosedTrade[] = [
  { ticker: 'NVDA',  company: 'NVIDIA',                  action: 'buy',  tradeDate: '2026-01-21', amountRange: [1_000_000, 5_000_000] },
  { ticker: 'AVGO',  company: 'Broadcom',                action: 'buy',  tradeDate: '2026-01-28', amountRange: [1_000_000, 5_000_000] },
  { ticker: 'MSFT',  company: 'Microsoft',               action: 'buy',  tradeDate: '2026-01-15', amountRange: [1_000_000, 5_000_000] },
  { ticker: 'AMZN',  company: 'Amazon',                  action: 'buy',  tradeDate: '2026-01-15', amountRange: [1_000_000, 5_000_000] },
  { ticker: 'ORCL',  company: 'Oracle',                  action: 'buy',  tradeDate: '2026-02-03', amountRange: [1_000_000, 5_000_000] },
];

function loadTrades(): DisclosedTrade[] {
  const raw = (tradesJson as { trades?: unknown }).trades;
  if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_TRADES;
  const valid = (raw as DisclosedTrade[]).filter(
    (t) =>
      t && typeof t.ticker === 'string' && (t.action === 'buy' || t.action === 'sell') &&
      Array.isArray(t.amountRange) && t.amountRange.length === 2
  );
  return valid.length > 0 ? valid : FALLBACK_TRADES;
}

/** 川普申報交易（載入自 data/trades.json，由 OGE 自動更新腳本維護） */
export const DISCLOSED_TRADES: DisclosedTrade[] = loadTrades();

/** 交易清單最後更新日（OGE 抓取時間，供 UI 顯示） */
export const TRADES_UPDATED_AT: string =
  (tradesJson as { updatedAt?: string }).updatedAt ?? '';

// ─── 概略種子建倉價（USD，approx，部署端應以歷史股價覆寫） ──────────────────
export const SEED_ENTRY_PRICES: Record<string, number> = {
  NVDA: 135, AVGO: 235, MSFT: 460, AMZN: 215, ORCL: 175,
  AMD: 125, INTC: 22, GS: 620, GOOGL: 175, ABNB: 135,
  DASH: 200, MU: 95, BE: 25,
};

export interface UniverseStock {
  ticker: string;
  company: string;
  seedEntryPrice: number;
}

/**
 * 等權重組合的標的池 = 川普「買進」過、且排除 EXCLUDED_TICKERS 的不重複代號。
 * （賣出標的如 META 不納入持股，只在交易明細裡呈現他的動作。）
 */
export function buildUniverse(): UniverseStock[] {
  const seen = new Set<string>();
  const universe: UniverseStock[] = [];
  for (const t of DISCLOSED_TRADES) {
    if (t.action !== 'buy') continue;
    if (EXCLUDED_TICKERS.has(t.ticker)) continue;
    if (seen.has(t.ticker)) continue;
    seen.add(t.ticker);
    universe.push({
      ticker: t.ticker,
      company: t.company,
      seedEntryPrice: SEED_ENTRY_PRICES[t.ticker] ?? 0,
    });
  }
  return universe;
}
