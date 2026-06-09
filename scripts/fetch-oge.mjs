// ─────────────────────────────────────────────────────────────────────────
//  OGE 自動抓取 / 解析腳本（在 GitHub Actions 執行，環境有對外網路）
//
//  流程：
//    1. 抓 OGE 總統申報索引頁，找出川普的 278-T PDF 連結
//       （並加上已知的直接 PDF 連結作為候選）。
//    2. 下載每份 PDF，用 pdf-parse 取出文字。
//    3. 以啟發式規則解析逐筆交易（ticker / 買賣 / 日期 / 金額區間）。
//    4. 解析筆數達門檻才覆寫 ../data/trades.json；否則保留原檔。
//
//  ⚠️ 278-T 為 PDF、版面不固定，解析規則屬最佳努力，可能需依實際輸出調校。
//     無論成敗皆 exit 0，避免讓 workflow 噴錯；以 log 呈現結果。
// ─────────────────────────────────────────────────────────────────────────

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'trades.json');

const INDEX_URL =
  'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView';

// 已知的直接 PDF 候選（索引解析失敗時的後備）
const KNOWN_PDFS = [
  'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/5326D3AF5BE7C25385258DF7002DD1B7/$FILE/Trump,%20Donald%20J.-05.08.2026-278T.pdf',
];

// 解析筆數低於此值就不覆寫（避免把好資料洗掉）
const MIN_TRADES = 8;

// 公司名 → ticker（PDF 內若無括號 ticker 時，用名稱比對補上）
const NAME_TO_TICKER = [
  ['nvidia', 'NVDA'], ['broadcom', 'AVGO'], ['microsoft', 'MSFT'],
  ['amazon', 'AMZN'], ['oracle', 'ORCL'], ['advanced micro', 'AMD'],
  ['intel', 'INTC'], ['goldman', 'GS'], ['alphabet', 'GOOGL'],
  ['airbnb', 'ABNB'], ['doordash', 'DASH'], ['micron', 'MU'],
  ['bloom energy', 'BE'], ['meta platforms', 'META'], ['apple', 'AAPL'],
  ['tesla', 'TSLA'], ['palantir', 'PLTR'], ['netflix', 'NFLX'],
  ['jpmorgan', 'JPM'], ['caterpillar', 'CAT'], ['boeing', 'BA'],
];

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[oge] ${res.status} ${url}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[oge] fetch fail ${url}: ${e.message}`);
    return null;
  }
}

async function fetchPdfText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[oge] PDF ${res.status} ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await pdfParse(buf);
    return out.text || null;
  } catch (e) {
    console.warn(`[oge] PDF parse fail ${url}: ${e.message}`);
    return null;
  }
}

// 從索引頁找出川普的 278-T PDF 連結
async function discoverPdfUrls() {
  const urls = new Set(KNOWN_PDFS);
  const html = await fetchText(INDEX_URL);
  if (html) {
    const re = /href="([^"]+\.pdf)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[1];
      if (!u.startsWith('http')) u = `https://extapps2.oge.gov${u}`;
      // 只收 Trump 的 278-T
      if (/trump/i.test(u) && /278/i.test(u)) urls.add(u);
    }
  }
  return [...urls];
}

function toIso(mdY) {
  const m = mdY.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function guessTicker(line) {
  const paren = line.match(/\(([A-Z]{1,5})\)/);
  if (paren) return paren[1];
  const low = line.toLowerCase();
  for (const [name, tk] of NAME_TO_TICKER) if (low.includes(name)) return tk;
  return null;
}

function parseAmountRange(segment) {
  const nums = [...segment.matchAll(/\$\s?([\d,]+)/g)].map((x) =>
    Number(x[1].replace(/,/g, ''))
  );
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return null;
}

// 啟發式：逐行找出 ticker + 買賣別(P/S) + 日期 + 金額區間
function parseTransactions(text) {
  const trades = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const ticker = guessTicker(line);
    if (!ticker) continue;

    const dateMatch = line.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    if (!dateMatch) continue;
    const tradeDate = toIso(dateMatch[0]);
    if (!tradeDate) continue;

    // 買賣別：日期前後出現獨立的 P 或 S
    const typeMatch = line.match(/(?:^|\s)([PS])(?:\s|$)/);
    const action = typeMatch ? (typeMatch[1] === 'P' ? 'buy' : 'sell') : null;
    if (!action) continue;

    const amountRange = parseAmountRange(line.slice(dateMatch.index));
    if (!amountRange) continue;

    const company = line
      .slice(0, line.indexOf('(') >= 0 ? line.indexOf('(') : 40)
      .replace(/^\d+[.)]?\s*/, '')
      .trim()
      .slice(0, 40) || ticker;

    trades.push({ ticker, company, action, tradeDate, amountRange, note: 'OGE 自動解析' });
  }
  return trades;
}

function dedupe(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    const key = `${t.ticker}|${t.action}|${t.tradeDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function main() {
  console.log('[oge] discovering PDFs…');
  const pdfUrls = await discoverPdfUrls();
  console.log(`[oge] ${pdfUrls.length} candidate PDF(s)`);

  let all = [];
  for (const url of pdfUrls) {
    const text = await fetchPdfText(url);
    if (!text) continue;
    const parsed = parseTransactions(text);
    console.log(`[oge] parsed ${parsed.length} from ${url}`);
    // 診斷：解析不到時，印出抽取文字的長度與樣本，供調校解析規則
    if (parsed.length === 0) {
      console.log(`[oge][debug] extracted text length = ${text.length}`);
      console.log('[oge][debug] ----- first 1800 chars -----');
      console.log(text.slice(0, 1800));
      console.log('[oge][debug] ----- end sample -----');
    }
    all = all.concat(parsed);
  }

  const trades = dedupe(all);
  console.log(`[oge] total unique parsed: ${trades.length}`);

  if (trades.length < MIN_TRADES) {
    console.warn(
      `[oge] below threshold (${trades.length} < ${MIN_TRADES}); keeping existing data/trades.json unchanged.`
    );
    return;
  }

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'OGE Form 278-T (auto-parsed by scripts/fetch-oge.mjs)',
    trades,
  };
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[oge] wrote ${trades.length} trades to data/trades.json`);
}

main().catch((e) => {
  console.error('[oge] unexpected error:', e);
  // 仍以 0 退出，避免破壞 workflow；保留原資料
  process.exit(0);
});
