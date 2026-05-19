import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hermès Monitor｜新品上架即時通知',
  description: '自動監控 Hermès 台灣官網，第一時間掌握新包款上架資訊',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
