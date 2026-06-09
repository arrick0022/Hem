// ─────────────────────────────────────────────────────────────────────────
//  抓取川普 Truth Social 貼文（伺服器端）
//
//  主來源：Truth Social（Mastodon 風格）公開 API —— 知名帳號免登入可讀。
//    1) /api/v1/accounts/lookup?acct=realDonaldTrump → 取得帳號 id
//    2) /api/v1/accounts/{id}/statuses → 取得貼文
//  備援：CNN 維護、每 5 分鐘更新的鏡像 JSON。
//
//  這些 host 在開放網路（Vercel）才連得到；受限沙箱會失敗 → 回空陣列，
//  呼叫端據此顯示「部署後即時抓取」提示，而非壞掉。
// ─────────────────────────────────────────────────────────────────────────

export interface TruthPost {
  id: string;
  createdAt: string; // ISO
  text: string;      // 去 HTML 後純文字
  url: string;
}

const UA = 'Mozilla/5.0';
const TIMEOUT = 9000;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 主來源：Truth Social Mastodon API
async function fromTruthSocial(limit: number): Promise<TruthPost[]> {
  const acct = (await getJson(
    'https://truthsocial.com/api/v1/accounts/lookup?acct=realDonaldTrump'
  )) as { id?: string } | null;
  if (!acct?.id) return [];

  const statuses = (await getJson(
    `https://truthsocial.com/api/v1/accounts/${acct.id}/statuses?exclude_replies=true&limit=${limit}`
  )) as Array<{ id: string; created_at: string; content: string; url: string }> | null;
  if (!Array.isArray(statuses)) return [];

  return statuses
    .map((s) => ({
      id: String(s.id),
      createdAt: s.created_at,
      text: stripHtml(s.content || ''),
      url: s.url || '',
    }))
    .filter((p) => p.text.length > 0);
}

// 備援：CNN 5 分鐘鏡像
async function fromCnnMirror(limit: number): Promise<TruthPost[]> {
  const data = (await getJson(
    'https://ix.cnn.io/data/truth-social/truth_archive.json'
  )) as Array<{ id: string; created_at: string; content: string; url: string }> | null;
  if (!Array.isArray(data)) return [];

  return data
    .slice(0, limit)
    .map((s) => ({
      id: String(s.id),
      createdAt: s.created_at,
      text: stripHtml(s.content || ''),
      url: s.url || '',
    }))
    .filter((p) => p.text.length > 0);
}

/** 取最新貼文；主來源失敗自動退備援；皆失敗回空陣列 */
export async function getLatestPosts(limit = 8): Promise<TruthPost[]> {
  const primary = await fromTruthSocial(limit);
  if (primary.length > 0) return primary;
  return fromCnnMirror(limit);
}
