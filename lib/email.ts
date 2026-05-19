import nodemailer from 'nodemailer';
import type { Product } from './scraper';

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_SENDER!,
      pass: process.env.EMAIL_APP_PASSWORD!,
    },
  });
}

function buildHtml(products: Product[]): string {
  const rows = products
    .map(
      (p) => `
      <tr>
        <td style="padding:16px; border-bottom:1px solid #f0ebe0; vertical-align:top; width:80px;">
          ${
            p.image
              ? `<img src="${p.image}" alt="${p.name}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;" />`
              : `<div style="width:80px;height:80px;background:#f5f0e8;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px;">👜</div>`
          }
        </td>
        <td style="padding:16px; border-bottom:1px solid #f0ebe0; vertical-align:top;">
          <div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">${p.name}</div>
          <div style="font-size:13px;color:#888;margin-bottom:8px;">分類：${p.category}</div>
          ${p.price ? `<div style="font-size:14px;color:#c9a84c;font-weight:600;margin-bottom:8px;">${p.price}</div>` : ''}
          <a href="${p.url}" style="display:inline-block;padding:8px 16px;background:#e8632a;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600;">
            查看商品 →
          </a>
        </td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:28px 32px;text-align:center;">
      <div style="font-size:11px;letter-spacing:4px;color:#c9a84c;margin-bottom:8px;">HERMÈS MONITOR</div>
      <div style="font-size:22px;font-weight:300;color:#fff;letter-spacing:2px;">新品上架通知</div>
    </div>

    <!-- Alert bar -->
    <div style="background:#e8632a;padding:12px 32px;text-align:center;">
      <span style="color:#fff;font-size:15px;font-weight:600;">
        🎉 發現 ${products.length} 件新品上架！
      </span>
    </div>

    <!-- Products -->
    <div style="padding:8px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f5f0e8;padding:20px 32px;text-align:center;border-top:1px solid #e8e0d0;">
      <a href="https://www.hermes.com/tw/zh/" style="color:#e8632a;font-size:13px;text-decoration:none;font-weight:600;">
        前往 Hermès 台灣官網
      </a>
      <div style="margin-top:8px;font-size:11px;color:#aaa;">
        此通知由 Hermes Monitor 自動發送 · ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendNewProductsEmail(products: Product[]): Promise<void> {
  const transporter = createTransporter();

  const subject =
    products.length === 1
      ? `👜 Hermès 新品上架：${products[0].name}`
      : `👜 Hermès 新品上架 ${products.length} 件新品！`;

  await transporter.sendMail({
    from: `"Hermès Monitor" <${process.env.EMAIL_SENDER}>`,
    to: process.env.EMAIL_RECIPIENT!,
    subject,
    html: buildHtml(products),
  });

  console.log(`[email] Sent notification for ${products.length} products`);
}
