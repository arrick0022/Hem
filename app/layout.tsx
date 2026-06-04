import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '川普跟單模擬｜$100K Trump Trades',
  description: '比照川普 OGE 申報交易、排除 DJT 等權重配置 $100,000 的虛擬模擬組合，每日損益即時更新。',
  // iOS「加入主畫面」設定
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '川普跟單',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
