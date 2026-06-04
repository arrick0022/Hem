// ─────────────────────────────────────────────────────────────────────────
//  OGE 官方資料源（Form 278-T）
//
//  最即時、最源頭的川普交易資料來自 OGE 公開入口的 278-T PDF：
//    https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView
//
//  限制與現況：
//  - 此 host 在開放網路才連得到（Vercel / GitHub Actions / 本機）；
//    受限沙箱會被擋。
//  - 278-T 以 PDF 揭露，逐筆解析需要 PDF 解析步驟（pdf-parse 等），
//    且版面不固定、需逐版調校。為避免引入未驗證的脆弱解析，
//    目前資料以 lib/trades.ts 的人工種子集為準。
//  - 下方提供「可即時運作」的索引抓取，作為自動更新的起點；
//    PDF→交易明細的解析留為 TODO（見 parseFilingPdf）。
// ─────────────────────────────────────────────────────────────────────────

const OGE_INDEX_URL =
  'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView';

export interface OgeFiling {
  /** 申報人 */
  name: string;
  /** 申報日期 */
  filedDate: string;
  /** PDF 連結 */
  pdfUrl: string;
}

/**
 * 抓取 OGE 總統提名/任命人員申報索引頁，過濾出指定申報人的 278-T 連結。
 * 開放網路才會成功；失敗回空陣列（呼叫端退回種子資料）。
 */
export async function fetchOgeFilings(
  filerName = 'Trump'
): Promise<OgeFiling[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(OGE_INDEX_URL, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const html = await res.text();
    const filings: OgeFiling[] = [];

    // 索引頁列出 <a href="...$FILE/....pdf">，逐一抽出
    const linkRe = /href="([^"]+\.pdf)"[^>]*>([^<]*278-?T[^<]*)</gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const pdfUrl = m[1].startsWith('http')
        ? m[1]
        : `https://extapps2.oge.gov${m[1]}`;
      const label = m[2].trim();
      if (label.toLowerCase().includes(filerName.toLowerCase())) {
        filings.push({ name: label, filedDate: '', pdfUrl });
      }
    }
    return filings;
  } catch {
    return [];
  }
}

/**
 * TODO：將 278-T PDF 解析成逐筆交易。
 * 需引入 PDF 解析（如 pdf-parse），並依 OGE 表格版面抽取
 *   asset / ticker / type(P/S) / date / amount range。
 * 解析完成前，資料以 lib/trades.ts 種子集為準。
 */
export async function parseFilingPdf(_pdfUrl: string): Promise<never[]> {
  return [];
}
