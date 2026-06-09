// ─────────────────────────────────────────────────────────────────────────
//  翻譯（免費、免金鑰）
//
//  用 Google 翻譯的非官方端點（translate.googleapis.com/translate_a/single）。
//  伺服器端呼叫；開放網路（Vercel）才連得到，受限沙箱會失敗 → 回 null，
//  呼叫端則只顯示原文。附簡單記憶體快取，避免重複翻同一則。
// ─────────────────────────────────────────────────────────────────────────

const cache = new Map<string, string>();
const TIMEOUT = 8000;

export async function translateToZh(
  text: string,
  target = 'zh-TW'
): Promise<string | null> {
  const key = `${target}:${text}`;
  if (cache.has(key)) return cache.get(key)!;
  if (!text.trim()) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto' +
      `&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    // 回傳格式：[[["譯文段","原文段",...], ...], ...]
    const data = (await res.json()) as unknown;
    const segments = (data as [[[string]]])?.[0];
    if (!Array.isArray(segments)) return null;
    const translated = segments.map((s) => s?.[0] ?? '').join('').trim();
    if (!translated) return null;

    if (cache.size > 500) cache.clear();
    cache.set(key, translated);
    return translated;
  } catch {
    return null;
  }
}
