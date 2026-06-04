// ─────────────────────────────────────────────────────────────────────────
//  即時股價抓取（伺服器端）
//
//  主來源：Stooq（免金鑰 CSV）；備援：Yahoo Finance chart API。
//  這些 host 在開放網路（Vercel / GitHub Actions / 本機）才連得到；
//  在受限沙箱會失敗，呼叫端需處理 null（退回種子價並標示「非即時」）。
// ─────────────────────────────────────────────────────────────────────────

export interface Quote {
  ticker: string;
  price: number;
  source: 'stooq' | 'yahoo';
}

const TIMEOUT_MS = 8000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Stooq：https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv
async function fromStooq(ticker: string): Promise<number | null> {
  const csv = await fetchText(
    `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`
  );
  if (!csv) return null;
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  const close = Number(cols[6]); // Symbol,Date,Time,Open,High,Low,Close,Volume
  return Number.isFinite(close) && close > 0 ? close : null;
}

// Yahoo：https://query1.finance.yahoo.com/v8/finance/chart/NVDA
async function fromYahoo(ticker: string): Promise<number | null> {
  const json = await fetchText(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
  );
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ── 歷史收盤價（成本基準用） ───────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// Stooq 歷史：取 [date-10天, date] 視窗，回傳視窗內最後一筆收盤
async function histStooq(ticker: string, date: string): Promise<number | null> {
  const end = new Date(date);
  const start = new Date(end.getTime() - 10 * 86_400_000);
  const csv = await fetchText(
    `https://stooq.com/q/d/l/?s=${ticker.toLowerCase()}.us&d1=${ymd(start)}&d2=${ymd(
      end
    )}&i=d`
  );
  if (!csv) return null;
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  // Date,Open,High,Low,Close,Volume — 取最後一筆（≤ date 的最近交易日）
  const last = lines[lines.length - 1].split(',');
  const close = Number(last[4]);
  return Number.isFinite(close) && close > 0 ? close : null;
}

// Yahoo 歷史：同樣取視窗，回傳最後一筆非空收盤
async function histYahoo(ticker: string, date: string): Promise<number | null> {
  const end = Math.floor(new Date(date).getTime() / 1000) + 86_400;
  const start = end - 12 * 86_400;
  const json = await fetchText(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${start}&period2=${end}&interval=1d`
  );
  if (!json) return null;
  try {
    const closes = JSON.parse(json)?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return null;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (typeof closes[i] === 'number' && closes[i] > 0) return closes[i];
    }
    return null;
  } catch {
    return null;
  }
}

/** 取某日（含之前最近交易日）的收盤價，作為成本基準；皆失敗回 null */
export async function getHistoricalClose(
  ticker: string,
  date: string
): Promise<number | null> {
  const s = await histStooq(ticker, date);
  if (s !== null) return s;
  return histYahoo(ticker, date);
}

/** 批次取歷史收盤；抓不到的不收錄 */
export async function getHistoricalCloses(
  tickers: string[],
  date: string
): Promise<Record<string, number>> {
  const results = await Promise.all(
    tickers.map(async (t) => [t, await getHistoricalClose(t, date)] as const)
  );
  const map: Record<string, number> = {};
  for (const [t, p] of results) if (p !== null) map[t] = p;
  return map;
}

/** 抓單檔現價，主來源失敗自動退備援；皆失敗回 null */
export async function getQuote(ticker: string): Promise<Quote | null> {
  const stooq = await fromStooq(ticker);
  if (stooq !== null) return { ticker, price: stooq, source: 'stooq' };
  const yahoo = await fromYahoo(ticker);
  if (yahoo !== null) return { ticker, price: yahoo, source: 'yahoo' };
  return null;
}

/** 批次抓多檔現價，回傳 ticker → 價格（抓不到的不收錄） */
export async function getQuotes(
  tickers: string[]
): Promise<Record<string, number>> {
  const results = await Promise.all(tickers.map((t) => getQuote(t)));
  const map: Record<string, number> = {};
  for (const q of results) {
    if (q) map[q.ticker] = q.price;
  }
  return map;
}
