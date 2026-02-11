import { useMemo, useState, useEffect, useRef } from 'react';
import { useDerivTicks } from './useDerivTicks';
import { generateSignal, type SignalResult, type IndicatorSignal } from './signalEngine';

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
    </span>
  );
}

function ConnectionBadge({ connected, error }: { connected: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <PulsingDot color={connected ? 'bg-emerald-400' : 'bg-red-400'} />
      <span className={`text-[11px] font-semibold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
        {error ? error : connected ? 'LIVE 24/7' : 'CONNECTING...'}
      </span>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: IndicatorSignal }) {
  const bgMap = {
    RISE: 'border-emerald-500/30 bg-emerald-500/5',
    FALL: 'border-red-500/30 bg-red-500/5',
    NEUTRAL: 'border-slate-600/30 bg-slate-700/10',
  };

  const badgeMap = {
    RISE: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    FALL: 'bg-red-500/20 text-red-300 border border-red-500/30',
    NEUTRAL: 'bg-slate-600/20 text-slate-400 border border-slate-600/30',
  };

  return (
    <div className={`rounded-xl border p-3.5 ${bgMap[indicator.direction]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{indicator.name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeMap[indicator.direction]}`}>
          {indicator.direction}
          {indicator.isStrongSignal ? ' • STRONG' : ''}
        </span>
      </div>
      <div className="text-[10px] text-slate-400">{indicator.detail}</div>
    </div>
  );
}

function SignalPanel({ signal }: { signal: SignalResult }) {
  const isRise = signal.direction === 'RISE';
  const isFall = signal.direction === 'FALL';

  const tone = signal.combinedLabel === 'STRONG RISE'
    ? 'text-emerald-300 border-emerald-500/60 from-emerald-900/60'
    : signal.combinedLabel === 'RISE' || signal.combinedLabel === 'WEAK RISE'
    ? 'text-emerald-400 border-emerald-500/30 from-emerald-900/30'
    : signal.combinedLabel === 'STRONG FALL'
    ? 'text-red-300 border-red-500/60 from-red-900/60'
    : signal.combinedLabel === 'FALL' || signal.combinedLabel === 'WEAK FALL'
    ? 'text-red-400 border-red-500/30 from-red-900/30'
    : 'text-slate-300 border-slate-600/40 from-slate-800/40';

  return (
    <div className={`rounded-2xl border-2 p-5 bg-gradient-to-br ${tone} to-transparent`}>
      <div className="text-center space-y-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-[0.3em]">R_50 Combined Signal • 2m Candles</div>
        <div className="text-5xl font-black tracking-tight">{signal.combinedLabel}</div>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Direction</div>
            <div className={isRise ? 'text-emerald-300 font-bold' : isFall ? 'text-red-300 font-bold' : 'text-slate-300 font-bold'}>{signal.direction}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Strength</div>
            <div className="font-bold">{signal.strength}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Confidence</div>
            <div className="font-bold">{signal.confidenceScore}</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
          <span>Rise: <strong className="text-emerald-400">{signal.riseCount}</strong></span>
          <span>Fall: <strong className="text-red-400">{signal.fallCount}</strong></span>
          <span>Neutral: <strong className="text-slate-300">{signal.neutralCount}</strong></span>
        </div>
      </div>
    </div>
  );
}

function HistoryEntry({ signal }: { signal: SignalResult }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/30">
      <span className="text-[10px] text-slate-500 font-mono">{new Date(signal.timestamp).toLocaleTimeString()}</span>
      <span className="text-[11px] font-bold text-slate-200">{signal.combinedLabel}</span>
      <span className="text-[10px] text-slate-400">{signal.confidenceScore}</span>
    </div>
  );
}

export function App() {
  const { candles, currentTick, isConnected, error, currentCandle, tickCount, reconnectCount } = useDerivTicks();
  const [signalHistory, setSignalHistory] = useState<SignalResult[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevSignalRef = useRef<SignalResult | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const allCandles = useMemo(() => (currentCandle ? [...candles, currentCandle] : candles), [candles, currentCandle]);

  const signal = useMemo(() => {
    if (allCandles.length < 100) return null;
    return generateSignal(allCandles);
  }, [allCandles]);

  const stableSignal = useMemo(() => {
    if (!signal) return prevSignalRef.current;
    prevSignalRef.current = signal;
    return signal;
  }, [signal]);

  useEffect(() => {
    if (!signal) return;
    setSignalHistory(prev => [signal, ...prev].slice(0, 30));
  }, [signal]);

  const priceStr = currentTick?.price?.toFixed(4) ?? '—';

  if (allCandles.length < 100) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-300 mb-2">Initializing Signal Engine</h2>
          <p className="text-sm text-slate-500 mb-4">Loading 100 candles for indicator warm-up...</p>
          <div className="space-y-1 text-xs text-slate-600">
            <div>Candles: <span className="text-blue-400 font-mono">{allCandles.length}/100</span></div>
            <div>Ticks: <span className="text-blue-400 font-mono">{tickCount}</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">R_50 Signal Engine</h1>
            <p className="text-[9px] text-slate-500">Ichimoku + 5 New Setups • 2min TF • Japanese Candles</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[9px] text-slate-500 uppercase">R_50</div>
              <div className="text-base font-mono font-bold">{priceStr}</div>
            </div>
            <div className="text-[10px] text-slate-500">{currentTime.toLocaleTimeString()}</div>
            <ConnectionBadge connected={isConnected} error={error} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 space-y-5">
        {stableSignal && <SignalPanel signal={stableSignal} />}

        {stableSignal && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Signal Sources (6)</h2>
                <div className="text-[10px] text-slate-600">2m timeframe • {allCandles.length} candles</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stableSignal.indicators.map((ind) => (
                  <IndicatorCard key={ind.name} indicator={ind} />
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
              <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold mb-3">Signal History</div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {signalHistory.map((s) => (
                  <HistoryEntry key={s.timestamp} signal={s} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="text-xs font-bold text-amber-300 mb-1">Disclaimer</h3>
          <p className="text-[10px] text-amber-400/70 leading-relaxed">
            For educational use only. Trading carries risk. Use this engine alongside your own analysis.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-800/50 mt-4 py-4">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-[10px] text-slate-600">
          <span>R_50 Signal Engine • 6-source consensus • 2m candles</span>
          <span>Reconnects: <span className="text-blue-400 font-mono">{reconnectCount}</span></span>
        </div>
      </footer>
    </div>
  );
}
