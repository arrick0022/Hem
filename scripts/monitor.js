/**
 * Hermes Bag Monitor
 * 使用 Playwright + Stealth 繞過 Cloudflare，監控 Hermes 台灣包款頁面
 * 在 GitHub Actions 上執行，每 5 分鐘一次
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const nodemailer = require('nodemailer');

chromium.use(StealthPlugin());

// ── 監控目標（皮件包包，排除衣服） ──────────────────────────────────
const TARGETS = [
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/bags/', category: '女士包款' },
  { url: 'https://www.hermes.com/tw/zh/category/men/bags-and-small-leather-goods/bags/', category: '男士包款' },
  { url: 'https://www.hermes.com/tw/zh/category/women/bags-and-small-leather-goods/small-leather-goods/', category: '女士皮件' },
  { url: 'https://www.hermes.com/tw/zh/category/men/bags-and-small-leather-goods/small-leather-goods/', category: '男士皮件' },
];

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEYS = {
  knownProducts: 'hermes:known_products',
  newHistory: 'hermes:new_history',
  stats: 'hermes:stats',
};

// ── Upstash Redis REST API ──────────────────────────────────────────
async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  if (!data.result) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function redisSet(key, value) {
  const serialized = JSON.stringify(value);
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(serialized),
  });
}

// ── 抓取單一頁面產品 ────────────────────────────────────────────────
async function scrapePage(browser, url, category) {
  const page = await browser.newPage();
  const products = [];

  try {
    console.log(`[monitor] Navigating to ${url}`);

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    // 導航並等待網頁載入
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    // 等待產品連結出現（最多 30 秒）
    try {
      await page.waitForSelector('a[href*="/tw/zh/product/"]', { timeout: 30000 });
    } catch {
      // 如果沒找到產品連結，可能還在 Cloudflare 驗證頁面
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200));
      console.log(`[monitor] No products found on ${url}. Title: ${title}, Body: ${bodyText}`);
      return products;
    }

    // 提取所有產品連結
    const extracted = await page.$$eval('a[href*="/tw/zh/product/"]', (links) => {
      const seen = new Set();
      return links.flatMap((a) => {
        const href = a.href || '';
        const id = href.replace(/\/$/, '').split('/').pop() || '';
        if (!id || id.length < 3 || seen.has(id)) return [];
        seen.add(id);

        // 取得產品名稱
        const name =
          a.querySelector('[class*="name"],[class*="title"],h2,h3,h4')?.textContent?.trim() ||
          a.getAttribute('aria-label') ||
          a.getAttribute('title') ||
          a.textContent?.trim() ||
          '';

        const img =
          a.querySelector('img')?.src ||
          a.querySelector('img')?.dataset?.src ||
          '';

        const price =
          a.querySelector('[class*="price"]')?.textContent?.trim() || '';

        return [{ id, name: name.slice(0, 100), url: href, image: img, price }];
      });
    });

    for (const p of extracted) {
      products.push({
        ...p,
        category,
        firstSeen: new Date().toISOString(),
      });
    }

    console.log(`[monitor] Extracted ${products.length} products from ${category}`);
  } catch (err) {
    console.error(`[monitor] Error scraping ${url}:`, err.message);
  } finally {
    await page.close();
  }

  return products;
}

// ── 發送 Email 通知 ────────────────────────────────────────────────
async function sendEmail(newProducts) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const productRows = newProducts.map((p) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #f0e6d6;">
        ${p.image ? `<img src="${p.image}" width="80" style="border-radius:4px;" />` : ''}
      </td>
      <td style="padding:12px;border-bottom:1px solid #f0e6d6;">
        <strong>${p.name || p.id}</strong><br/>
        <span style="color:#888;font-size:12px;">${p.category}</span>
        ${p.price ? `<br/><span style="color:#C9A84C;">${p.price}</span>` : ''}
      </td>
      <td style="padding:12px;border-bottom:1px solid #f0e6d6;">
        <a href="${p.url}" style="background:#E8632A;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">查看商品</a>
      </td>
    </tr>
  `).join('');

  await transporter.sendMail({
    from: `"Hermes 監控" <${process.env.GMAIL_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `🟠 Hermes 新上架 ${newProducts.length} 件包款！`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
        <div style="background:#1A1A1A;padding:24px;text-align:center;">
          <h1 style="color:#C9A84C;margin:0;font-size:24px;letter-spacing:3px;">HERMÈS</h1>
          <p style="color:#fff;margin:8px 0 0;font-size:14px;">台灣官網新上架通知</p>
        </div>
        <div style="padding:24px;">
          <p style="color:#333;font-size:16px;">偵測到 <strong style="color:#E8632A;">${newProducts.length}</strong> 件新商品上架：</p>
          <table width="100%" cellpadding="0" cellspacing="0">${productRows}</table>
          <p style="color:#888;font-size:12px;margin-top:24px;">
            由 GitHub Actions + Playwright 自動監控 | ${new Date().toLocaleString('zh-TW')}
          </p>
        </div>
      </div>
    `,
  });

  console.log(`[monitor] Email sent for ${newProducts.length} new products`);
}

// ── 更新統計 ────────────────────────────────────────────────────────
async function updateStats(newCount) {
  const stats = (await redisGet(KEYS.stats)) ?? {
    totalChecks: 0, totalNewFound: 0, lastCheckAt: '',
  };
  await redisSet(KEYS.stats, {
    totalChecks: stats.totalChecks + 1,
    totalNewFound: stats.totalNewFound + newCount,
    lastCheckAt: new Date().toISOString(),
    lastNewAt: newCount > 0 ? new Date().toISOString() : stats.lastNewAt,
  });
}

// ── 主流程 ──────────────────────────────────────────────────────────
async function main() {
  console.log('[monitor] Starting Hermes bag monitor...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  const allProducts = [];
  const seen = new Set();

  try {
    for (const target of TARGETS) {
      const products = await scrapePage(browser, target.url, target.category);
      for (const p of products) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          allProducts.push(p);
        }
      }
      // 隨機等待 2-5 秒，模擬人類行為
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }
  } finally {
    await browser.close();
  }

  console.log(`[monitor] Total products found: ${allProducts.length}`);

  if (allProducts.length === 0) {
    console.log('[monitor] No products found (Cloudflare may still be blocking)');
    await updateStats(0);
    return;
  }

  // 比較已知商品
  const known = (await redisGet(KEYS.knownProducts)) ?? {};
  const newProducts = allProducts.filter((p) => !known[p.id]);

  console.log(`[monitor] New products: ${newProducts.length}`);

  if (newProducts.length > 0) {
    // 發送通知
    await sendEmail(newProducts);

    // 更新已知清單
    const updatedKnown = { ...known };
    for (const p of newProducts) {
      updatedKnown[p.id] = p;
    }
    await redisSet(KEYS.knownProducts, updatedKnown);

    // 更新歷史紀錄
    const history = (await redisGet(KEYS.newHistory)) ?? [];
    await redisSet(KEYS.newHistory, [...newProducts, ...history].slice(0, 200));
  }

  await updateStats(newProducts.length);
  console.log('[monitor] Done.');
}

main().catch((err) => {
  console.error('[monitor] Fatal error:', err);
  process.exit(1);
});
