// ─────────────────────────────────────────────────────────────────────────
//  貼文市場影響分析（規則版 / 免費）
//
//  偵測：被點名的個股 ticker、總經主題關鍵字、粗略多空傾向。
//  ※ 這是啟發式規則，非投資建議；之後可加 AI 版（見 analyzePostAI 介面位）。
// ─────────────────────────────────────────────────────────────────────────

export type Lean = 'bullish' | 'bearish' | 'neutral';

export interface PostAnalysis {
  tickers: string[];     // 偵測到的個股
  topics: string[];      // 命中的總經主題（中文標籤）
  lean: Lean;            // 粗略多空傾向
  keywords: string[];    // 命中的關鍵字（供呈現）
}

// 公司名/關鍵詞 → ticker
const NAME_TICKER: Array<[RegExp, string]> = [
  [/\bnvidia\b/i, 'NVDA'], [/\bbroadcom\b/i, 'AVGO'], [/\bmicrosoft\b/i, 'MSFT'],
  [/\bamazon\b/i, 'AMZN'], [/\boracle\b/i, 'ORCL'], [/\bapple\b/i, 'AAPL'],
  [/\btesla\b/i, 'TSLA'], [/\bmeta\b|\bfacebook\b/i, 'META'], [/\bgoogle\b|\balphabet\b/i, 'GOOGL'],
  [/\bintel\b/i, 'INTC'], [/\bboeing\b/i, 'BA'], [/\bgoldman\b/i, 'GS'],
  [/\bjpmorgan\b|\bjp morgan\b/i, 'JPM'], [/\btruth social\b|\btrump media\b/i, 'DJT'],
  [/\bnetflix\b/i, 'NFLX'], [/\bmicron\b/i, 'MU'],
];

// 總經主題關鍵字 → [中文標籤, 多空傾向]
const TOPICS: Array<[RegExp, string, Lean]> = [
  [/tariff|關稅/i, '關稅', 'bearish'],
  [/\bchina\b|chinese|中國/i, '中國/貿易', 'bearish'],
  [/\bfed\b|powell|interest rate|rate cut|利率|降息/i, '聯準會/利率', 'neutral'],
  [/inflation|通膨/i, '通膨', 'bearish'],
  [/\boil\b|opec|energy|石油|能源/i, '能源/油價', 'neutral'],
  [/\bdeal\b|agreement|協議/i, '協議/利多', 'bullish'],
  [/\bwar\b|iran|russia|ukraine|戰爭/i, '地緣政治', 'bearish'],
  [/sanction|制裁/i, '制裁', 'bearish'],
  [/crypto|bitcoin|加密/i, '加密貨幣', 'neutral'],
];

// 多空語氣詞
const BULLISH = /\b(great|strong|win|winning|booming|record|best|surge|grow|deal|lower rates|cut rates)\b/i;
const BEARISH = /\b(crash|tank|disaster|worst|collapse|tariff|sanction|threat|ban|punish|war|raise rates)\b/i;

function detectTickers(text: string): string[] {
  const set = new Set<string>();
  // cashtags：$AAPL
  for (const m of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) set.add(m[1].toUpperCase());
  // 公司名
  for (const [re, tk] of NAME_TICKER) if (re.test(text)) set.add(tk);
  return [...set];
}

function detectTopics(text: string): { topics: string[]; keywords: string[]; topicLean: Lean } {
  const topics: string[] = [];
  const keywords: string[] = [];
  let bull = 0;
  let bear = 0;
  for (const [re, label, lean] of TOPICS) {
    const m = text.match(re);
    if (m) {
      if (!topics.includes(label)) topics.push(label);
      keywords.push(m[0]);
      if (lean === 'bullish') bull++;
      else if (lean === 'bearish') bear++;
    }
  }
  const topicLean: Lean = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  return { topics, keywords, topicLean };
}

/** 規則版分析 */
export function analyzePost(text: string): PostAnalysis {
  const tickers = detectTickers(text);
  const { topics, keywords, topicLean } = detectTopics(text);

  // 語氣詞加權後得出最終傾向
  let score = topicLean === 'bullish' ? 1 : topicLean === 'bearish' ? -1 : 0;
  if (BULLISH.test(text)) score += 1;
  if (BEARISH.test(text)) score -= 1;
  const lean: Lean = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';

  return { tickers, topics, lean, keywords: [...new Set(keywords)] };
}
