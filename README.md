# Hermès Monitor 🛍️

自動監控 Hermès 台灣官網，發現新包款立即寄送 Email 通知。

## 部署步驟

### 第一步：安裝 Node.js
前往 https://nodejs.org 下載並安裝 LTS 版本

### 第二步：安裝依賴套件
```bash
npm install
```

### 第三步：建立 Upstash Redis（免費）
1. 前往 https://console.upstash.com 註冊
2. 點 「Create Database」→ 選 Regional → 選 ap-northeast-1（東京）
3. 建立後複製 REST URL 和 REST Token

### 第四步：取得 Gmail 應用程式密碼
1. 前往 https://myaccount.google.com/security
2. 啟用「兩步驟驗證」
3. 搜尋「應用程式密碼」→ 建立一個新的
4. 複製 16 位數密碼（格式：xxxx xxxx xxxx xxxx）

### 第五步：上傳到 GitHub
1. 前往 https://github.com 建立新 repository（名稱：hermes-monitor）
2. 在桌面 hermes-monitor 資料夾中：
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的帳號/hermes-monitor.git
git push -u origin main
```

### 第六步：部署到 Vercel
1. 前往 https://vercel.com 用 GitHub 帳號登入
2. 點「Add New Project」→ 選 hermes-monitor
3. 在「Environment Variables」加入以下變數：
   - UPSTASH_REDIS_REST_URL
   - UPSTASH_REDIS_REST_TOKEN
   - EMAIL_SENDER
   - EMAIL_APP_PASSWORD
   - EMAIL_RECIPIENT
   - CRON_SECRET（自訂一串隨機字串）
4. 點「Deploy」

### 第七步：設定 cron-job.org（每 3 分鐘觸發）
1. 前往 https://cron-job.org 免費註冊
2. 點「Create cronjob」
3. 填入：
   - URL：`https://你的網站.vercel.app/api/check?secret=你的CRON_SECRET`
   - 執行頻率：每 3 分鐘
4. 儲存

## 完成！🎉
- 網站：https://你的網站.vercel.app
- 每 3 分鐘自動掃描 Hermès 台灣官網
- 發現新品立即寄 Email 給您
