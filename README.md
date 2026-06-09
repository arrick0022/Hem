# 川普跟單模擬組合 📈 Trump Trades Sim

用虛擬 **$100,000** 比照美國總統川普向 **OGE（政府道德辦公室）申報的股票交易**，
**排除其個人控股 DJT、等權重**配置，做成一個**每日損益即時更新的網頁儀表板**。
部署到 Vercel 後，在 iPhone 上「加入主畫面」即可像 App 一樣隨時打開查看。

---

## 它在做什麼

- **資料源**：OGE Form 278-T（川普季度財產申報）。注意申報**法定延遲 30–45 天，非即時**。
  交易清單存在 `data/trades.json`，由 `.github/workflows/update-oge.yml`（每週 + 可手動觸發）
  執行 `scripts/fetch-oge.mjs`，從 OGE 官方入口抓取 PDF、解析後**自動 commit 更新**
  → Vercel 偵測到推送即自動重新部署。解析失敗時保留原資料、不中斷。
- **策略**：排除 `DJT`（佔比 >99%），把川普「買進」過的不重複標的**等權重**配置 $100,000。
- **現價**：由 Stooq / Yahoo 免金鑰端點即時抓取（伺服器端），計算市值與未實現損益。

> ⚠️ 純屬虛擬模擬與資訊用途，**非投資建議**。OGE 多筆交易標註「券商代操」，未必為川普本人決策。

---

## 在 iPhone 上部署到 Vercel（一次性，約 5 分鐘）

> 全程在手機瀏覽器即可完成，不需要電腦。

1. 程式碼已在 GitHub 分支 `claude/trump-stock-trading-sim-v0wCN`。
   先到你的 GitHub repo，把這個分支合併到 `main`（或部署時直接選這個分支）。
2. 手機 Safari 開 **https://vercel.com** → 用 GitHub 帳號登入。
3. 點 **Add New… → Project** → 選這個 repo（`hem`）→ **Import**。
4. 框架自動偵測為 **Next.js**，**不需要設定任何環境變數**，直接點 **Deploy**。
5. 等約 1 分鐘，部署完成會給你一個網址，例如
   `https://hem-xxxx.vercel.app`。
6. 用 Safari 打開該網址 → 點底部「分享」→ **加入主畫面**。
   桌面就會出現「川普跟單」圖示，點開就是即時損益儀表板。✅

之後每次打開，現價即時抓取、損益自動更新（頁面每 5 分鐘也會自動刷新）。

---

## 本機開發

```bash
npm install
npm run dev      # http://localhost:3000
```

## 專案結構

| 檔案 | 作用 |
|---|---|
| `data/trades.json` | 川普申報交易清單（OGE 自動更新腳本維護的單一資料源） |
| `lib/trades.ts` | 載入交易、$100K 本金、排除 DJT、標的池（含退場資料） |
| `lib/prices.ts` | 即時現價 + 建倉日歷史價抓取（Stooq 主、Yahoo 備援） |
| `lib/portfolio.ts` | 模擬引擎：等權重配置、市值與損益計算 |
| `scripts/fetch-oge.mjs` | 從 OGE 抓取/解析 278-T PDF，更新 data/trades.json |
| `.github/workflows/update-oge.yml` | 每週自動執行上述腳本並 commit 更新 |
| `app/api/portfolio/route.ts` | 回傳組合快照 JSON |
| `app/page.tsx` | 行動優先的損益儀表板 |

## 已知限制

- 「即時」僅在開放網路環境（Vercel / 本機）生效；交易清單仍隨 OGE 申報低頻更新。
- 種子建倉價為概略值，部署端可改以建倉日歷史股價覆寫以提高準確度。
