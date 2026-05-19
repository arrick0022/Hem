'use client';

import { useEffect, useState, useCallback } from 'react';

interface Product {
  id: string;
  name: string;
  url: string;
  price?: string;
  image?: string;
  category: string;
  firstSeen: string;
}

interface Stats {
  totalChecks: number;
  totalNewFound: number;
  lastCheckAt: string;
  lastNewAt?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data.history ?? []);
      setStats(data.stats ?? null);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 每 3 分鐘自動重新整理
    const interval = setInterval(fetchData, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-h-screen" style={{ background: '#f5f0e8' }}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header style={{ background: '#1a1a1a' }} className="sticky top-0 z-10 shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[4px] mb-1" style={{ color: '#c9a84c' }}>
              HERMÈS TAIWAN
            </p>
            <h1 className="text-xl font-light tracking-widest text-white">
              新品上架監控
            </h1>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              監控中
            </span>
            <p className="text-xs mt-1" style={{ color: '#888' }}>
              每 3 分鐘自動檢查
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* ─── Stats Cards ─────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: '總檢查次數', value: stats.totalChecks.toLocaleString(), icon: '🔍' },
              { label: '累計發現新品', value: stats.totalNewFound.toLocaleString(), icon: '👜' },
              {
                label: '上次檢查',
                value: timeAgo(stats.lastCheckAt),
                icon: '🕐',
              },
              {
                label: '上次發現新品',
                value: stats.lastNewAt ? timeAgo(stats.lastNewAt) : '尚未發現',
                icon: '✨',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl p-4 shadow-sm"
                style={{ background: '#fff', border: '1px solid #e8e0d0' }}
              >
                <div className="text-2xl mb-1">{card.icon}</div>
                <div className="text-xl font-semibold" style={{ color: '#1a1a1a' }}>
                  {card.value}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#888' }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Products ────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-wide" style={{ color: '#1a1a1a' }}>
            新品紀錄
            {products.length > 0 && (
              <span
                className="ml-2 text-xs px-2 py-0.5 rounded-full font-normal"
                style={{ background: '#e8632a', color: '#fff' }}
              >
                {products.length}
              </span>
            )}
          </h2>
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-full transition-all"
            style={{ background: '#1a1a1a', color: '#fff' }}
          >
            ↻ 重新整理
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-3 animate-spin">⟳</div>
            <p>載入中…</p>
          </div>
        ) : products.length === 0 ? (
          <div
            className="rounded-2xl p-16 text-center shadow-sm"
            style={{ background: '#fff', border: '1px solid #e8e0d0' }}
          >
            <div className="text-5xl mb-4">👜</div>
            <p className="text-lg font-medium mb-2" style={{ color: '#1a1a1a' }}>
              尚未發現新品
            </p>
            <p className="text-sm" style={{ color: '#aaa' }}>
              監控系統正在運作，發現新品時會立即寄送 Email 通知
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{ background: '#fff', border: '1px solid #e8e0d0' }}
              >
                {/* Image */}
                <div
                  className="relative h-52 flex items-center justify-center overflow-hidden"
                  style={{ background: '#f5f0e8' }}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <span className="text-6xl">👜</span>
                  )}
                  <span
                    className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full"
                    style={{ background: '#1a1a1a', color: '#c9a84c' }}
                  >
                    {p.category}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3
                    className="font-semibold text-sm leading-snug line-clamp-2 mb-1"
                    style={{ color: '#1a1a1a' }}
                  >
                    {p.name}
                  </h3>
                  {p.price && (
                    <p className="text-sm font-medium mb-2" style={{ color: '#c9a84c' }}>
                      {p.price}
                    </p>
                  )}
                  <p className="text-xs" style={{ color: '#aaa' }}>
                    發現於 {formatTime(p.firstSeen)}
                  </p>
                </div>

                {/* CTA */}
                <div
                  className="px-4 py-3 border-t flex items-center justify-between"
                  style={{ borderColor: '#f0ebe0' }}
                >
                  <span className="text-xs font-medium" style={{ color: '#e8632a' }}>
                    查看商品
                  </span>
                  <span style={{ color: '#e8632a' }}>→</span>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* ─── Footer ──────────────────────────────────────────── */}
        <footer className="mt-12 text-center text-xs" style={{ color: '#bbb' }}>
          <p>最後更新：{lastRefresh.toLocaleTimeString('zh-TW')}</p>
          <p className="mt-1">
            監控網站 · 每 3 分鐘自動掃描{' '}
            <a
              href="https://www.hermes.com/tw/zh/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#e8632a' }}
            >
              Hermès 台灣官網
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
