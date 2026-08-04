// ─────────────────────────────────────────────────────────────────────────
//  OGE 278-T 自動抓取 / 解析（在 GitHub Actions 執行，runner 有對外網路）
//
//  ⚠️ 本機沙箱連不到 oge.gov（網路政策擋 CONNECT），只能在 Actions 驗證。
//
//  流程：
//    1. 抓 OGE 總統申報索引頁，找出川普的 278-T PDF 連結。
//    2. 下載 PDF → 先用 pdf-parse 取文字；
//       文字太少（＝掃描檔，這是舊版失敗主因）則改走 OCR：
//       pdftoppm 轉圖 → tesseract 辨識。
//    3. 啟發式解析逐筆交易（ticker / 買賣 / 日期 / 金額區間）。
//    4. 與現有 data/trades.json 【合併】（不是覆寫），只新增沒看過的交易。
//
//  調校方式：Actions log 會印出擷取到的原始文字樣本（DIAG），
//  依實際版面調整 parseTransactions() 的規則。
//  DRY_RUN=1 時只解析、只印 log，不寫檔。
//  無論成敗皆 exit 0，避免 workflow 噴錯；結果以 log 呈現。
// ─────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);
// 延遲載入：讓本檔在未安裝相依時仍可被 import（供解析規則單測）
let _pdfParse = null;
const pdfParse = (buf) => (_pdfParse ??= require('pdf-parse'))(buf);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'trades.json');

const INDEX_URL = 'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView';
const DRY_RUN = process.env.DRY_RUN === '1';

// 已知的直接 PDF 候選（索引解析失敗時的後備）
const KNOWN_PDFS = [
  'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/5326D3AF5BE7C25385258DF7002DD1B7/$FILE/Trump,%20Donald%20J.-05.08.2026-278T.pdf',
];

// pdf-parse 取到的字數低於此值 → 視為掃描檔，改走 OCR
const OCR_TEXT_THRESHOLD = 400;
// 單份 PDF 最多 OCR 幾頁（避免 Actions 逾時；278-T 常有數十頁）
const MAX_OCR_PAGES = 40;
// log 印出的原始文字樣本長度
const DIAG_CHARS = 3000;

// 公司名 → ticker（PDF 內若無括號 ticker 時，用名稱比對補上）
const NAME_TO_TICKER = [
  ['nvidia', 'NVDA'], ['broadcom', 'AVGO'], ['microsoft', 'MSFT'],
  ['amazon', 'AMZN'], ['oracle', 'ORCL'], ['advanced micro', 'AMD'],
  ['intel', 'INTC'], ['goldman', 'GS'], ['alphabet', 'GOOGL'],
  ['airbnb', 'ABNB'], ['doordash', 'DASH'], ['micron', 'MU'],
  ['bloom energy', 'BE'], ['meta platforms', 'META'], ['apple', 'AAPL'],
  ['tesla', 'TSLA'], ['palantir', 'PLTR'], ['netflix', 'NFLX'],
  ['jpmorgan', 'JPM'], ['caterpillar', 'CAT'], ['boeing', 'BA'],
  ['unitedhealth', 'UNH'], ['ge aerospace', 'GE'], ['robinhood', 'HOOD'],
  ['coinbase', 'COIN'], ['sandisk', 'SNDK'], ['lockheed', 'LMT'],
  ['northrop', 'NOC'], ['general dynamics', 'GD'], ['l3harris', 'LHX'],
  ['rtx', 'RTX'], ['qualcomm', 'QCOM'], ['synopsys', 'SNPS'],
  ['cadence', 'CDNS'], ['dell', 'DELL'], ['visa', 'V'],
  ['citigroup', 'C'], ['bank of america', 'BAC'], ['adobe', 'ADBE'],
  ['procter', 'PG'],
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

async function fetchPdfBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      console.warn(`[oge] PDF ${res.status} ${url}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn(`[oge] PDF fetch fail ${url}: ${e.message}`);
    return null;
  }
}

async function haveBinary(bin) {
  try {
    await execFileP('which', [bin]);
    return true;
  } catch {
    return false;
  }
}

/** 掃描檔 OCR：pdftoppm 轉 PNG → tesseract 辨識 */
async function ocrPdf(buf) {
  if (!(await haveBinary('pdftoppm')) || !(await haveBinary('tesseract'))) {
    console.warn('[oge] OCR 跳過：缺 pdftoppm / tesseract');
    return null;
  }
  const dir = await mkdtemp(join(tmpdir(), 'oge-'));
  const pdfPath = join(dir, 'in.pdf');
  await writeFile(pdfPath, buf);
  try {
    // 300 dpi 灰階，較利於表格文字辨識
    await execFileP(
      'pdftoppm',
      ['-r', '300', '-gray', '-png', '-l', String(MAX_OCR_PAGES), pdfPath, join(dir, 'page')],
      { timeout: 300000, maxBuffer: 1 << 28 }
    );
    const pages = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    console.log(`[oge] OCR ${pages.length} 頁…`);
    let out = '';
    for (const p of pages) {
      try {
        // --psm 6：假設為單一整齊文字區塊，適合表格列
        const { stdout } = await execFileP(
          'tesseract',
          [join(dir, p), 'stdout', '--psm', '6'],
          { timeout: 120000, maxBuffer: 1 << 28 }
        );
        out += stdout + '\n';
      } catch (e) {
        console.warn(`[oge] OCR 單頁失敗 ${p}: ${e.message}`);
      }
    }
    return out || null;
  } catch (e) {
    console.warn(`[oge] OCR 失敗: ${e.message}`);
    return null;
  }
}

/** 取 PDF 文字：先 pdf-parse，字太少則 OCR */
async function extractText(url) {
  const buf = await fetchPdfBuffer(url);
  if (!buf) return null;

  let text = null;
  try {
    const out = await pdfParse(buf);
    text = out.text || '';
  } catch (e) {
    console.warn(`[oge] pdf-parse 失敗: ${e.message}`);
    text = '';
  }

  if (text.trim().length >= OCR_TEXT_THRESHOLD) {
    console.log(`[oge] 文字版 PDF，取得 ${text.length} 字`);
    return text;
  }

  console.log(`[oge] 文字僅 ${text.trim().length} 字 → 判定掃描檔，改用 OCR`);
  const ocr = await ocrPdf(buf);
  if (ocr) console.log(`[oge] OCR 取得 ${ocr.length} 字`);
  return ocr;
}

async function discoverPdfUrls() {
  const urls = new Set(KNOWN_PDFS);
  const html = await fetchText(INDEX_URL);
  if (html) {
    const re = /href="([^"]+\.pdf)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[1];
      if (!u.startsWith('http')) u = `https://extapps2.oge.gov${u}`;
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

/** 啟發式：逐行找出 ticker + 買賣別(P/S) + 日期 + 金額區間 */
export function parseTransactions(text) {
  const trades = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const ticker = guessTicker(line);
    if (!ticker) continue;

    const dateMatch = line.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    if (!dateMatch) continue;
    const tradeDate = toIso(dateMatch[0]);
    if (!tradeDate) continue;

    const typeMatch = line.match(/(?:^|\s)([PS])(?:\s|$)/);
    const action = typeMatch ? (typeMatch[1] === 'P' ? 'buy' : 'sell') : null;
    if (!action) continue;

    const amountRange = parseAmountRange(line.slice(dateMatch.index));
    if (!amountRange) continue;

    // 公司名 = 括號前；無括號時取到日期前，並去掉尾端孤立的 P/S 買賣標記
    const cutAt = line.indexOf('(') >= 0 ? line.indexOf('(') : dateMatch.index;
    const company =
      line
        .slice(0, cutAt)
        .replace(/^\d+[.)]?\s*/, '')
        .replace(/\s+[PS]\s*$/, '')
        .trim()
        .slice(0, 40) || ticker;

    trades.push({ ticker, company, action, tradeDate, amountRange, note: 'OGE 自動解析' });
  }
  return trades;
}

const keyOf = (t) => `${t.ticker}|${t.action}|${t.tradeDate}`;

async function readExisting() {
  try {
    const j = JSON.parse(await readFile(DATA_PATH, 'utf8'));
    return Array.isArray(j.trades) ? j : { trades: [] };
  } catch {
    return { trades: [] };
  }
}

async function main() {
  console.log(`[oge] 開始${DRY_RUN ? '（DRY_RUN：不寫檔）' : ''}`);
  const pdfUrls = await discoverPdfUrls();
  console.log(`[oge] 候選 PDF ${pdfUrls.length} 份`);

  let parsed = [];
  for (const url of pdfUrls) {
    const text = await extractText(url);
    if (!text) {
      console.warn(`[oge] 取不到文字：${url}`);
      continue;
    }
    // ── 診斷：印出原始文字樣本，供調規則用 ──
    console.log(`\n===== DIAG 原始文字樣本 (${url}) =====`);
    console.log(text.slice(0, DIAG_CHARS));
    console.log('===== DIAG 結束 =====\n');

    const rows = parseTransactions(text);
    console.log(`[oge] 從此份解析出 ${rows.length} 筆`);
    parsed = parsed.concat(rows);
  }

  console.log(`[oge] 解析總計 ${parsed.length} 筆`);
  if (parsed.length === 0) {
    console.warn('[oge] 解析 0 筆 → 保留原資料不變。請看上面 DIAG 調整規則。');
    return;
  }

  // ── 與現有資料合併（不覆寫，只補新的） ──
  const existing = await readExisting();
  const seen = new Set(existing.trades.map(keyOf));
  const fresh = parsed.filter((t) => !seen.has(keyOf(t)));

  console.log(`[oge] 其中未收錄的新交易 ${fresh.length} 筆`);
  if (fresh.length === 0) {
    console.log('[oge] 沒有新交易，維持原檔。');
    return;
  }
  for (const t of fresh) {
    console.log(`  + ${t.tradeDate} ${t.action.toUpperCase()} ${t.ticker} $${t.amountRange[0]}–${t.amountRange[1]}`);
  }

  if (DRY_RUN) {
    console.log('[oge] DRY_RUN：不寫檔結束。');
    return;
  }

  const payload = {
    ...existing,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: `${existing.source || ''} + OGE 278-T 自動解析`.replace(/^ \+ /, ''),
    trades: [...existing.trades, ...fresh],
  };
  await writeFile(DATA_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[oge] 已寫入，新增 ${fresh.length} 筆，總計 ${payload.trades.length} 筆`);
}

// 僅在直接執行時跑；被 import 時（單測）不跑
if (process.argv[1] && process.argv[1].endsWith('fetch-oge.mjs')) {
  main().catch((e) => {
    console.error('[oge] 非預期錯誤:', e);
    process.exit(0); // 保留原資料，不讓 workflow 失敗
  });
}
