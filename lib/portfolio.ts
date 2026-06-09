// ─────────────────────────────────────────────────────────────────────────
//  模擬組合引擎
//
//  策略：比照川普 OGE 申報「買進」標的，排除 DJT，等權重配置 $100k。
//  每檔配置 = 本金 / 檔數；現價即時抓取後計算市值與未實現損益。
// ─────────────────────────────────────────────────────────────────────────

import {
  buildUniverse,
  STARTING_CAPITAL,
  INCEPTION_DATE,
  DISCLOSED_TRADES,
  TRADES_UPDATED_AT,
  type DisclosedTrade,
} from './trades';
import { getQuotes, getHistoricalCloses } from './prices';

export interface Position {
  ticker: string;
  company: string;
  /** 每檔等權配置金額（= 成本基準） */
  allocation: number;
  /** 建倉價（建倉日真實歷史收盤；抓不到才退回種子價） */
  entryPrice: number;
  /** 建倉價是否為真實歷史價（false = 退回種子近似值） */
  entryLive: boolean;
  /** 股數（含小數，模擬可買零股） */
  shares: number;
  /** 現價（即時，抓不到則退回建倉價） */
  currentPrice: number;
  /** 此檔現價是否為即時抓取 */
  priceLive: boolean;
  marketValue: number;
  pnl: number;
  pnlPct: number;
}

export interface PortfolioSnapshot {
  asOf: string;
  inceptionDate: string;
  startingCapital: number;
  positions: Position[];
  totalCost: number;
  totalMarketValue: number;
  totalPnl: number;
  totalPnlPct: number;
  /** 是否全部現價皆為即時 */
  pricesLive: boolean;
  /** 現價即時抓到的檔數 / 總檔數 */
  liveCount: number;
  /** 成本基準採用真實歷史價的檔數 */
  entryLiveCount: number;
  /** 川普申報交易明細（含買賣，供活動列呈現） */
  disclosedTrades: DisclosedTrade[];
  /** 交易清單最後由 OGE 更新的日期 */
  tradesUpdatedAt: string;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * 計算模擬組合快照。
 * @param liveQuotes 可選；外部已抓好的現價（ticker→price）。未提供則自行抓取。
 */
export async function computePortfolio(
  liveQuotes?: Record<string, number>
): Promise<PortfolioSnapshot> {
  const universe = buildUniverse();
  const n = universe.length;
  const allocation = STARTING_CAPITAL / n;
  const tickers = universe.map((u) => u.ticker);

  // 成本基準＝建倉日真實歷史收盤；現價＝即時。兩者同源，避免假成本灌爆報酬。
  const [entryPrices, quotes] = await Promise.all([
    getHistoricalCloses(tickers, INCEPTION_DATE),
    liveQuotes ? Promise.resolve(liveQuotes) : getQuotes(tickers),
  ]);

  const positions: Position[] = universe.map((u) => {
    const histEntry = entryPrices[u.ticker];
    const entryLive = typeof histEntry === 'number' && histEntry > 0;
    const entryPrice = entryLive ? histEntry : u.seedEntryPrice;
    const shares = entryPrice > 0 ? allocation / entryPrice : 0;
    const live = quotes[u.ticker];
    const priceLive = typeof live === 'number' && live > 0;
    const currentPrice = priceLive ? live : entryPrice;
    const marketValue = shares * currentPrice;
    const pnl = marketValue - allocation;
    return {
      ticker: u.ticker,
      company: u.company,
      allocation: round(allocation),
      entryPrice: round(entryPrice),
      entryLive,
      shares: round(shares, 4),
      currentPrice: round(currentPrice),
      priceLive,
      marketValue: round(marketValue),
      pnl: round(pnl),
      pnlPct: round((pnl / allocation) * 100),
    };
  });

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost = STARTING_CAPITAL;
  const totalPnl = totalMarketValue - totalCost;
  const liveCount = positions.filter((p) => p.priceLive).length;
  const entryLiveCount = positions.filter((p) => p.entryLive).length;

  return {
    asOf: new Date().toISOString(),
    inceptionDate: INCEPTION_DATE,
    startingCapital: STARTING_CAPITAL,
    positions,
    totalCost: round(totalCost),
    totalMarketValue: round(totalMarketValue),
    totalPnl: round(totalPnl),
    totalPnlPct: round((totalPnl / totalCost) * 100),
    pricesLive: liveCount === n,
    liveCount,
    entryLiveCount,
    disclosedTrades: DISCLOSED_TRADES,
    tradesUpdatedAt: TRADES_UPDATED_AT,
  };
}
