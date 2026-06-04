'use client';

import { useEffect, useState, useCallback } from 'react';

interface Position {
  ticker: string;
  company: string;
  allocation: number;
  entryPrice: number;
  entryLive: boolean;
  shares: number;
  currentPrice: number;
  priceLive: boolean;
  marketValue: number;
  pnl: number;
  pnlPct: number;
}

interface DisclosedTrade {
  ticker: string;
  company: string;
  action: 'buy' | 'sell';
  tradeDate: string;
  amountRange: [number, number];
  note?: string;
}

interface Snapshot {
  asOf: string;
  inceptionDate: string;
  startingCapital: number;
  positions: Position[];
  totalCost: number;
  totalMarketValue: number;
  totalPnl: number;
  totalPnlPct: number;
  pricesLive: boolean;
  liveCount: number;
  entryLiveCount: number;
  disclosedTrades: DisclosedTrade[];
}

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const sign = (n: number) => `${n >= 0 ? '+' : ''}${usd(n)}`;

function gain(n: number) {
  return n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#6b7280';
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function amountLabel([lo, hi]: [number, number]) {
  const m = (v: number) => `$${(v / 1_000_000).toFixed(v < 1_000_000 ? 1 : 0)}M`;
  const k = (v: number) => `$${(v / 1000).toFixed(0)}K`;
  const f = (v: number) => (v >= 1_000_000 ? m(v) : k(v));
  return `${f(lo)} – ${f(hi)}`;
}

export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // 每 5 分鐘自動更新
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-screen pb-16" style={{ background: '#0b1220', color: '#e5e7eb' }}>
      {/* Header */}
      <header className="sticky top-0 z-10" style={{ background: '#0b1220', borderBottom: '1px solid #1e293b' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[3px]" style={{ color: '#60a5fa' }}>TRUMP TRADES · 跟單模擬</p>
            <h1 className="text-lg font-bold tracking-wide text-white">川普跟單 $100K 模擬組合</h1>
          </div>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ background: '#1e293b', color: '#93c5fd' }}
          >↻ 更新</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {loading ? (
          <div className="text-center py-24" style={{ color: '#64748b' }}>
            <div className="text-3xl mb-2 animate-spin">⟳</div>載入中…
          </div>
        ) : err ? (
          <div className="rounded-xl p-5 text-sm" style={{ background: '#1e293b', color: '#fca5a5' }}>
            載入失敗：{err}
          </div>
        ) : data ? (
          <>
            {/* 即時狀態提示 */}
            {(!data.pricesLive || data.entryLiveCount < data.positions.length) && (
              <div className="rounded-xl p-3 mb-4 text-xs leading-relaxed"
                style={{ background: '#422006', color: '#fcd34d', border: '1px solid #854d0e' }}>
                ⚠️ 現價即時 {data.liveCount}/{data.positions.length}、成本基準採真實歷史價 {data.entryLiveCount}/{data.positions.length}。
                抓不到的檔位會退回近似種子價，其損益僅供參考。
              </div>
            )}

            {/* 總覽卡片 */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Card label="總市值" value={usd(data.totalMarketValue)} sub={`本金 ${usd(data.startingCapital)}`} />
              <Card label="總損益" value={sign(data.totalPnl)} color={gain(data.totalPnl)}
                sub={pct(data.totalPnlPct)} subColor={gain(data.totalPnl)} />
              <Card label="持股檔數" value={`${data.positions.length} 檔`} sub="等權重 · 排除 DJT" />
              <Card label="建倉基準日" value={data.inceptionDate} sub={`更新 ${fmtTime(data.asOf)}`} />
            </div>

            {/* 持股明細 */}
            <h2 className="text-sm font-semibold mb-2 mt-6" style={{ color: '#93c5fd' }}>📊 持股明細（損益）</h2>
            <div className="space-y-2">
              {data.positions.map((p) => (
                <div key={p.ticker} className="rounded-xl p-3" style={{ background: '#111a2e', border: '1px solid #1e293b' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-white">{p.ticker}</span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{p.company}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold" style={{ color: gain(p.pnl) }}>{sign(p.pnl)}</div>
                      <div className="text-xs" style={{ color: gain(p.pnl) }}>{pct(p.pnlPct)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[11px]" style={{ color: '#94a3b8' }}>
                    <Cell k="股數" v={p.shares.toFixed(2)} />
                    <Cell k="成本價" v={usd2(p.entryPrice)} />
                    <Cell k="現價" v={p.priceLive ? usd2(p.currentPrice) : '—'} />
                    <Cell k="市值" v={usd(p.marketValue)} />
                  </div>
                </div>
              ))}
            </div>

            {/* 川普申報交易 */}
            <h2 className="text-sm font-semibold mb-2 mt-7" style={{ color: '#93c5fd' }}>🗂️ 川普 OGE 申報交易（Q1 2026）</h2>
            <div className="space-y-1.5">
              {data.disclosedTrades.map((t, i) => (
                <div key={i} className="rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                  style={{ background: '#111a2e', border: '1px solid #1e293b' }}>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-bold text-[10px]"
                      style={{ background: t.action === 'buy' ? '#14532d' : '#7f1d1d', color: t.action === 'buy' ? '#86efac' : '#fca5a5' }}>
                      {t.action === 'buy' ? '買進' : '賣出'}
                    </span>
                    <span className="font-bold text-white">{t.ticker}</span>
                    <span style={{ color: '#64748b' }}>{t.company}</span>
                  </div>
                  <div className="text-right" style={{ color: '#94a3b8' }}>
                    <div>{t.tradeDate}</div>
                    <div className="text-[10px]" style={{ color: '#64748b' }}>{amountLabel(t.amountRange)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 免責 */}
            <footer className="mt-8 text-[11px] leading-relaxed" style={{ color: '#475569' }}>
              <p className="mb-1">
                資料源：OGE Form 278-T（季度申報，法定延遲 30–45 天，非即時）；現價由 Stooq / Yahoo 即時抓取。
              </p>
              <p className="mb-1">
                策略：排除川普個人控股 DJT，將其申報「買進」的不重複標的等權重配置 $100,000；金額以建倉基準日為準。
              </p>
              <p>⚠️ 純屬虛擬模擬與資訊用途，非投資建議。OGE 多筆標註「券商代操」，未必為其本人決策。</p>
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Card({ label, value, sub, color, subColor }:
  { label: string; value: string; sub?: string; color?: string; subColor?: string }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: '#111a2e', border: '1px solid #1e293b' }}>
      <div className="text-[11px] mb-1" style={{ color: '#64748b' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color ?? '#fff' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: subColor ?? '#64748b' }}>{sub}</div>}
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px]" style={{ color: '#475569' }}>{k}</div>
      <div className="text-white">{v}</div>
    </div>
  );
}
