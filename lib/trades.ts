// ─────────────────────────────────────────────────────────────────────────
//  川普交易資料（種子資料集）
//
//  來源：OGE Form 278-T（Periodic Transaction Report），2026 Q1 申報，
//        2026-05 公布。約 3,600+ 筆交易，金額以「區間」揭露（無確切價）。
//
//  注意：
//  - OGE 申報法定延遲約 30–45 天，非即時。
//  - 本檔為人工整理的「精選代表性交易」，非完整 3,600 筆。
//    部署後可由 lib/oge.ts 從 OGE 官方入口抓取 PDF 自動更新。
//  - entryPrice 為「概略」種子價（標 approx），實際成本基準應由
//    部署端以建倉日歷史股價覆寫；現價一律由 lib/prices.ts 即時抓取。
// ─────────────────────────────────────────────────────────────────────────

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

// ─── 川普 Q1 2026 申報交易（精選） ─────────────────────────────────────────
// 多數標註 "Discretion Exercised / Broker Acted as Agent" = 券商代操帳戶。
export const DISCLOSED_TRADES: DisclosedTrade[] = [
  // ── 買進 ──
  { ticker: 'NVDA',  company: 'NVIDIA',              action: 'buy',  tradeDate: '2026-01-21', amountRange: [1_000_000, 5_000_000], note: '券商代操' },
  { ticker: 'AVGO',  company: 'Broadcom',            action: 'buy',  tradeDate: '2026-01-28', amountRange: [1_000_000, 5_000_000], note: '券商代操' },
  { ticker: 'MSFT',  company: 'Microsoft',           action: 'buy',  tradeDate: '2026-01-15', amountRange: [1_000_000, 5_000_000], note: '券商代操' },
  { ticker: 'AMZN',  company: 'Amazon',              action: 'buy',  tradeDate: '2026-01-15', amountRange: [1_000_000, 5_000_000], note: '券商代操' },
  { ticker: 'ORCL',  company: 'Oracle',              action: 'buy',  tradeDate: '2026-02-03', amountRange: [1_000_000, 5_000_000], note: '科技倉位' },
  { ticker: 'AMD',   company: 'Advanced Micro Devices', action: 'buy', tradeDate: '2026-02-05', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'INTC',  company: 'Intel',               action: 'buy',  tradeDate: '2026-02-05', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'GS',    company: 'Goldman Sachs',       action: 'buy',  tradeDate: '2026-02-11', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'GOOGL', company: 'Alphabet',            action: 'buy',  tradeDate: '2026-02-18', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'ABNB',  company: 'Airbnb',              action: 'buy',  tradeDate: '2026-02-24', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'DASH',  company: 'DoorDash',            action: 'buy',  tradeDate: '2026-02-24', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'MU',    company: 'Micron Technology',   action: 'buy',  tradeDate: '2026-03-03', amountRange: [500_000, 1_000_000], note: '券商代操' },
  { ticker: 'BE',    company: 'Bloom Energy',        action: 'buy',  tradeDate: '2026-03-10', amountRange: [500_000, 1_000_000], note: '券商代操' },

  // ── 賣出（2/10 大規模減碼） ──
  { ticker: 'MSFT',  company: 'Microsoft',           action: 'sell', tradeDate: '2026-02-10', amountRange: [5_000_000, 25_000_000], note: '單日大減碼' },
  { ticker: 'AMZN',  company: 'Amazon',              action: 'sell', tradeDate: '2026-02-10', amountRange: [5_000_000, 25_000_000], note: '單日大減碼' },
  { ticker: 'META',  company: 'Meta Platforms',      action: 'sell', tradeDate: '2026-02-10', amountRange: [5_000_000, 25_000_000], note: '單日大減碼' },
];

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
