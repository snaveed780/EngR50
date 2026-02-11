import { useMemo, useState, useEffect, useRef } from 'react';
import { useDerivTicks } from './useDerivTicks';
import { generateSignal, type SignalResult, type IndicatorSignal } from './signalEngine';

// ─── Helper Components ──────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
    </span>
  );
}

function ConnectionBadge({ connected, error, reconnectCount, lastTickTime }: {
  connected: boolean;
  error: string | null;
  reconnectCount: number;
  lastTickTime: number;
}) {
  const [ago, setAgo] = useState('');

  useEffect(() => {
    const iv = setInterval(() => {
      if (lastTickTime > 0) {
        const s = Math.floor((Date.now() - lastTickTime) / 1000);
        setAgo(s < 2 ? 'just now' : `${s}s ago`);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [lastTickTime]);

  return (
    <div className="flex items-center gap-2">
      <PulsingDot color={connected ? 'bg-emerald-400' : 'bg-red-400'} />
      <div className="flex flex-col">
        <span className={`text-[11px] font-semibold leading-tight ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          {error ? error : connected ? 'LIVE 24/7' : 'CONNECTING...'}
        </span>
        <span className="text-[9px] text-slate-500 leading-tight">
          {connected && ago ? `Last tick ${ago}` : reconnectCount > 0 ? `Retry #${reconnectCount}` : ''}
        </span>
      </div>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: IndicatorSignal }) {
  const bgMap = {
    RISE: 'border-emerald-500/30 bg-emerald-500/5',
    FALL: 'border-red-500/30 bg-red-500/5',
    NEUTRAL: 'border-slate-600/30 bg-slate-700/10',
  };
  const textMap = {
    RISE: 'text-emerald-400',
    FALL: 'text-red-400',
    NEUTRAL: 'text-slate-400',
  };
  const badgeMap = {
    RISE: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    FALL: 'bg-red-500/20 text-red-300 border border-red-500/30',
    NEUTRAL: 'bg-slate-600/20 text-slate-400 border border-slate-600/30',
  };
  const arrowMap = {
    RISE: '▲',
    FALL: '▼',
    NEUTRAL: '●',
  };

  return (
    <div className={`rounded-xl border p-3.5 transition-all duration-500 ${bgMap[indicator.direction]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{indicator.name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeMap[indicator.direction]}`}>
          {arrowMap[indicator.direction]} {indicator.direction}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 leading-tight max-w-[65%]">{indicator.detail}</span>
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                indicator.direction === 'RISE'
                  ? 'bg-emerald-400'
                  : indicator.direction === 'FALL'
                  ? 'bg-red-400'
                  : 'bg-slate-500'
              }`}
              style={{ width: `${indicator.confidence}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono font-bold w-8 text-right ${textMap[indicator.direction]}`}>
            {indicator.confidence}%
          </span>
        </div>
      </div>
    </div>
  );
}

function SignalPanel({ signal }: { signal: SignalResult }) {
  const isRise = signal.direction === 'RISE';
  const isFall = signal.direction === 'FALL';
  const isActive = isRise || isFall;

  const bgGradient = isRise
    ? 'from-emerald-900/60 via-emerald-800/20 to-transparent'
    : isFall
    ? 'from-red-900/60 via-red-800/20 to-transparent'
    : 'from-slate-800/60 via-slate-700/20 to-transparent';

  const borderColor = isRise
    ? 'border-emerald-500/60'
    : isFall
    ? 'border-red-500/60'
    : 'border-slate-600/40';

  const glowColor = isRise
    ? 'shadow-[0_0_40px_rgba(16,185,129,0.15)]'
    : isFall
    ? 'shadow-[0_0_40px_rgba(239,68,68,0.15)]'
    : '';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-4 md:p-6 bg-gradient-to-br ${bgGradient} ${borderColor} ${glowColor} transition-all duration-700`}
    >
      {/* Animated background pulse */}
      {isActive && (
        <div className="absolute inset-0 animate-pulse opacity-[0.07]">
          <div className={`w-full h-full ${isRise ? 'bg-emerald-500' : 'bg-red-500'}`} />
        </div>
      )}

      <div className="relative z-10">
        {/* Signal Direction */}
        <div className="text-center mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-[0.4em] mb-2 font-semibold">
            R_50 Signal • 2m Structure + 5m Expiry
          </div>
          <div
            className={`text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-none ${
              isRise ? 'text-emerald-400' : isFall ? 'text-red-400' : 'text-slate-500'
            }`}
          >
            {isRise && (
              <span className="inline-flex items-center gap-3">
                <svg className="w-12 h-12 sm:w-14 sm:h-14 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 14l5-5 5 5H7z" />
                </svg>
                RISE
              </span>
            )}
            {isFall && (
              <span className="inline-flex items-center gap-3">
                <svg className="w-12 h-12 sm:w-14 sm:h-14 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 10l5 5 5-5H7z" />
                </svg>
                FALL
              </span>
            )}
            {signal.direction === 'NEUTRAL' && (
              <span className="inline-flex items-center gap-3">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 animate-spin" style={{ animationDuration: '3s' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                NEUTRAL
              </span>
            )}

          </div>
        </div>

        {/* Strength & Confidence */}
        {isActive && (
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-3">
            <div className="text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Strength</div>
              <div
                className={`text-base sm:text-lg font-bold ${
                  signal.strength.includes('STRONG')
                    ? isRise ? 'text-emerald-300' : isFall ? 'text-red-300' : 'text-slate-300'
                    : signal.strength.includes('WEAK')
                    ? 'text-amber-400'
                    : isRise ? 'text-emerald-300' : isFall ? 'text-red-300' : 'text-slate-300'
                }`}
              >
                {signal.strength}
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Confidence</div>
              <div className={`text-base sm:text-lg font-bold ${isRise ? 'text-emerald-300' : 'text-red-300'}`}>
                {signal.confidence}%
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-center">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Expiry</div>
              <div className="text-base sm:text-lg font-bold text-blue-300">5 min (2m candles)</div>
            </div>
          </div>
        )}

        {!isActive && (
          <div className="text-center mb-2">
            <p className="text-sm text-slate-500 mt-1">
              Market is neutral. No clear directional bias.
            </p>
            <p className="text-[10px] text-slate-600 mt-2 italic">{signal.reason}</p>
          </div>
        )}

        {/* Vote Summary */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-slate-400">Rise: <strong className="text-emerald-400">{signal.riseCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-[11px] text-slate-400">Fall: <strong className="text-red-400">{signal.fallCount}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
            <span className="text-[11px] text-slate-400">Neutral: <strong className="text-slate-300">{signal.neutralCount}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniGauge({ label, value, min, max, zones }: {
  label: string;
  value: number;
  min: number;
  max: number;
  zones: { from: number; to: number; color: string }[];
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const activeZone = zones.find(z => value >= z.from && value <= z.to);
  const color = activeZone?.color || 'bg-slate-400';

  return (
    <div className="text-center">
      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-mono font-bold text-slate-200">{value.toFixed(1)}</div>
      <div className="w-full h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HistoryEntry({ signal, index }: { signal: SignalResult; index: number }) {
  const time = new Date(signal.timestamp).toLocaleTimeString();
  const isRise = signal.direction === 'RISE';
  const isFall = signal.direction === 'FALL';

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg transition-all duration-300 ${
      index === 0 ? 'bg-slate-800/60 border border-slate-700/40' : 'hover:bg-slate-800/20'
    }`}>
      <span className="text-[10px] text-slate-500 font-mono w-16">{time}</span>
      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
        isRise ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' :
        isFall ? 'text-red-400 bg-red-500/10 border border-red-500/20' :
        'text-slate-500 bg-slate-600/10 border border-slate-600/20'
      }`}>
        {signal.direction}
      </span>
      {(isRise || isFall) ? (
        <span className={`text-[10px] font-mono font-semibold w-10 text-right ${isRise ? 'text-emerald-400' : 'text-red-400'}`}>
          {signal.confidence}%
        </span>
      ) : (
        <span className="text-[10px] text-slate-600 w-10 text-right">—</span>
      )}
    </div>
  );
}

// ─── Consensus Meter Component ──────────────────────────────────────────────

function ConsensusMeter({ signal }: { signal: SignalResult }) {
  const total = signal.riseCount + signal.fallCount + signal.neutralCount;
  if (total === 0) return null;
  const riseW = (signal.riseCount / total) * 100;
  const neutralW = (signal.neutralCount / total) * 100;
  const fallW = (signal.fallCount / total) * 100;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
      <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold mb-4">
        Consensus Meter
      </div>

      {/* Visual Bar */}
      <div className="relative h-9 rounded-full overflow-hidden bg-slate-800">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all duration-700 flex items-center justify-center"
          style={{ width: `${riseW}%` }}
        >
          {riseW > 12 && <span className="text-[10px] font-bold text-white drop-shadow">RISE {signal.riseCount}</span>}
        </div>
        <div
          className="absolute top-0 h-full bg-slate-600 transition-all duration-700 flex items-center justify-center"
          style={{ left: `${riseW}%`, width: `${neutralW}%` }}
        >
          {neutralW > 12 && <span className="text-[10px] font-bold text-white/80">{signal.neutralCount}</span>}
        </div>
        <div
          className="absolute top-0 right-0 h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-700 flex items-center justify-center"
          style={{ width: `${fallW}%` }}
        >
          {fallW > 12 && <span className="text-[10px] font-bold text-white drop-shadow">FALL {signal.fallCount}</span>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-2 text-[9px] text-slate-500">
        <span>← Bullish</span>
        <span className="text-slate-600">Neutral</span>
        <span>Bearish →</span>
      </div>

      {/* Signal Rules */}
      <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Rules:</strong>{' '}
          <strong className="text-emerald-400">STRONG RISE/FALL</strong> = 5-6 setups agree.{' '}
          <strong className="text-blue-300">RISE/FALL</strong> = 4 setups agree.{' '}
          <strong className="text-amber-400">WEAK RISE/FALL</strong> = 3 setups agree vs opposite.{' '}
          Tie = <strong className="text-slate-300">NEUTRAL</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── Indicator Details Component ────────────────────────────────────────────

function IndicatorDetails({ signal }: { signal: SignalResult }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
      <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold mb-3">
        Key Metrics & Details
      </div>

      {/* Quick Gauges */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {signal.rsi && (
          <MiniGauge
            label="RSI"
            value={signal.rsi.value}
            min={0}
            max={100}
            zones={[
              { from: 0, to: 30, color: 'bg-emerald-400' },
              { from: 30, to: 70, color: 'bg-slate-400' },
              { from: 70, to: 100, color: 'bg-red-400' },
            ]}
          />
        )}
        {signal.stochRSI && (
          <MiniGauge
            label="StochRSI K"
            value={signal.stochRSI.k}
            min={0}
            max={100}
            zones={[
              { from: 0, to: 20, color: 'bg-emerald-400' },
              { from: 20, to: 80, color: 'bg-blue-400' },
              { from: 80, to: 100, color: 'bg-red-400' },
            ]}
          />
        )}
        {signal.adx && (
          <MiniGauge
            label="ADX"
            value={signal.adx.adx}
            min={0}
            max={60}
            zones={[
              { from: 0, to: 20, color: 'bg-slate-500' },
              { from: 20, to: 40, color: 'bg-amber-400' },
              { from: 40, to: 60, color: 'bg-orange-500' },
            ]}
          />
        )}
        {signal.atr && (
          <MiniGauge
            label="ATR"
            value={signal.atr.value}
            min={0}
            max={signal.atr.avgATR * 3}
            zones={[
              { from: 0, to: signal.atr.avgATR, color: 'bg-blue-400' },
              { from: signal.atr.avgATR, to: signal.atr.avgATR * 2, color: 'bg-amber-400' },
              { from: signal.atr.avgATR * 2, to: signal.atr.avgATR * 3, color: 'bg-red-400' },
            ]}
          />
        )}
      </div>

      {/* MACD Details */}
      {signal.macd && (
        <div className="py-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">MACD Histogram</span>
            <span className={`text-xs font-mono font-bold ${
              signal.macd.histogram > 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {signal.macd.histogram > 0 ? '+' : ''}{signal.macd.histogram.toFixed(4)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[10px] text-slate-600">MACD: {signal.macd.macd.toFixed(4)}</span>
            <span className="text-[10px] text-slate-600">Signal: {signal.macd.signal.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Ichimoku Details */}
      {signal.ichimoku && (
        <div className="py-3 border-t border-slate-800">
          <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Ichimoku Cloud</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-600">Tenkan</span>
              <span className="text-[10px] font-mono text-slate-400">{signal.ichimoku.tenkanSen.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-600">Kijun</span>
              <span className="text-[10px] font-mono text-slate-400">{signal.ichimoku.kijunSen.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-600">Cloud Top</span>
              <span className="text-[10px] font-mono text-slate-400">{signal.ichimoku.cloudTop.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-600">Cloud Bot</span>
              <span className="text-[10px] font-mono text-slate-400">{signal.ichimoku.cloudBottom.toFixed(4)}</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              signal.ichimoku.priceAboveCloud ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              signal.ichimoku.priceBelowCloud ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
              'bg-slate-600/10 text-slate-400 border border-slate-600/20'
            }`}>
              {signal.ichimoku.priceAboveCloud ? '↑ Above Cloud' :
               signal.ichimoku.priceBelowCloud ? '↓ Below Cloud' : '○ In Cloud'}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              signal.ichimoku.futureCloudGreen ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {signal.ichimoku.futureCloudGreen ? '↑ Future Green' : '↓ Future Red'}
            </span>
          </div>
        </div>
      )}

      {/* Bollinger Details */}
      {signal.bollinger && (
        <div className="py-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Bollinger Bands</span>
            <span className="text-[10px] font-mono text-slate-400">
              %B: {(signal.bollinger.percentB * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[10px] text-slate-600">U: {signal.bollinger.upper.toFixed(3)}</span>
            <span className="text-[10px] text-slate-600">M: {signal.bollinger.middle.toFixed(3)}</span>
            <span className="text-[10px] text-slate-600">L: {signal.bollinger.lower.toFixed(3)}</span>
          </div>
        </div>
      )}

      {/* MA Details */}
      {signal.ma && (
        <div className="py-3 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Moving Averages</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              signal.ma.ema20AboveEma50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {signal.ma.ema20AboveEma50 ? 'EMA20 > EMA50' : 'EMA20 < EMA50'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-600">EMA20: {signal.ma.ema20.toFixed(3)}</span>
            <span className="text-[10px] text-slate-600">EMA50: {signal.ma.ema50.toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export function App() {
  const { candles, currentTick, isConnected, error, currentCandle, tickCount, lastTickTime, reconnectCount } = useDerivTicks();
  const [signalHistory, setSignalHistory] = useState<SignalResult[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevSignalRef = useRef<SignalResult | null>(null);

  // Time updater — every second for smooth candle progress
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // All candles including the forming one
  const allCandles = useMemo(() => {
    if (currentCandle) {
      return [...candles, currentCandle];
    }
    return candles;
  }, [candles, currentCandle]);

  // Generate signal — memoized on candle changes
  const signal = useMemo(() => {
    if (allCandles.length < 52) return null;
    const newSignal = generateSignal(allCandles);
    return newSignal;
  }, [allCandles]);

  // Use a stabilized signal to prevent UI flicker
  const stableSignal = useMemo(() => {
    if (!signal) return prevSignalRef.current;
    prevSignalRef.current = signal;
    return signal;
  }, [signal]);

  // Track signal history
  useEffect(() => {
    if (!signal) return;
    setSignalHistory(prev => {
      const last = prev[0];
      if (!last || last.direction !== signal.direction || Date.now() - last.timestamp > 30000) {
        return [signal, ...prev].slice(0, 30);
      }
      return prev;
    });
  }, [signal]);

  // Price formatting
  const price = currentTick?.price;
  const priceStr = price?.toFixed(4) ?? '—';

  // Candle progress
  const candleProgress = useMemo(() => {
    if (!currentCandle) return 0;
    const elapsed = Date.now() - currentCandle.timestamp;
    return Math.min((elapsed / (2 * 60 * 1000)) * 100, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCandle, currentTime]);

  // Time remaining in candle
  const candleTimeLeft = useMemo(() => {
    if (!currentCandle) return '';
    const elapsed = Date.now() - currentCandle.timestamp;
    const remaining = Math.max(0, 2 * 60 * 1000 - elapsed);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCandle, currentTime]);

  // ─── Loading State ────────────────────────────────────────────────────────

  if (allCandles.length < 52) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
            <div className="absolute inset-6 rounded-full border-2 border-transparent border-t-purple-400 animate-spin" style={{ animationDuration: '2s' }} />
          </div>
          <h2 className="text-xl font-bold text-slate-300 mb-2">Initializing Signal Engine</h2>
          <p className="text-sm text-slate-500 mb-4">Connecting to Deriv R_50 & loading 2-min candle history...</p>
          <div className="flex justify-center mb-4">
            <ConnectionBadge connected={isConnected} error={error} reconnectCount={reconnectCount} lastTickTime={lastTickTime} />
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <div>Candles loaded: <span className="text-blue-400 font-mono font-bold">{allCandles.length}</span> / 52 minimum</div>
            <div>Ticks received: <span className="text-blue-400 font-mono font-bold">{tickCount}</span></div>
          </div>
          <div className="w-56 h-1.5 bg-slate-800 rounded-full mt-4 mx-auto overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min((allCandles.length / 52) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-tight">R_50 Signal Engine</h1>
              <p className="text-[9px] text-slate-500 leading-tight">Ichimoku Cloud + 7 Indicators • 2min TF • 5min Expiry</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            {/* Live Price */}
            <div className="text-right">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">R_50</div>
              <div className="text-base sm:text-lg font-mono font-bold text-white tracking-wider">{priceStr}</div>
            </div>

            {/* Candle Progress */}
            <div className="text-right hidden sm:block">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Candle</div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-1000" style={{ width: `${candleProgress}%` }} />
                </div>
                <span className="text-[10px] font-mono text-blue-400 w-10">{candleTimeLeft}</span>
              </div>
            </div>

            <ConnectionBadge connected={isConnected} error={error} reconnectCount={reconnectCount} lastTickTime={lastTickTime} />
          </div>
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 space-y-5">

        {/* ── Row 1: Signal Panel (full width, prominent) ─────────────────── */}
        {stableSignal && <SignalPanel signal={stableSignal} />}

        {/* ── Row 2: Consensus Meter + Indicator Cards (side by side) ─────── */}
        {stableSignal && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Consensus + Details */}
            <div className="lg:col-span-5 space-y-4">
              <ConsensusMeter signal={stableSignal} />
              <IndicatorDetails signal={stableSignal} />
            </div>

            {/* Right: Indicator Analysis Cards */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Indicator Analysis
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-slate-600">
                  <span>{allCandles.length} candles</span>
                  <span>•</span>
                  <span>2min TF</span>
                  <span>•</span>
                  <span>{currentTime.toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stableSignal.indicators.map((ind) => (
                  <IndicatorCard key={ind.name} indicator={ind} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Row 3: Signal History ───────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold">
              Signal History
            </div>
            <span className="text-[10px] text-slate-600">{signalHistory.length} signals recorded</span>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
            {signalHistory.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-6">Waiting for first signal...</p>
            )}
            {signalHistory.map((s, i) => (
              <HistoryEntry key={`${s.timestamp}-${i}`} signal={s} index={i} />
            ))}
          </div>
        </div>

        {/* ── Row 4: Disclaimer ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-amber-400 text-base">⚠</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-300 mb-1">Disclaimer</h3>
              <p className="text-[10px] text-amber-400/70 leading-relaxed">
                This signal engine is for educational purposes only. Binary options trading involves significant risk.
                Past indicator performance does not guarantee future results. Always trade responsibly and never invest
                more than you can afford to lose. Use this alongside your own analysis on the live chart below.
              </p>
            </div>
          </div>
        </div>

        {/* ── Row 5: Deriv Chart Embed (end of page) ──────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">D</span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-300">Deriv Live Chart — R_50</h3>
                <p className="text-[9px] text-slate-500">Cross-reference signals with the live chart below</p>
              </div>
            </div>
            <a
              href="https://charts.deriv.com/deriv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 bg-blue-500/5"
            >
              Open Full Screen
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          <div className="relative w-full" style={{ paddingBottom: '56.25%', minHeight: '400px' }}>
            <iframe
              src="https://charts.deriv.com/deriv"
              title="Deriv Chart — R_50"
              className="absolute inset-0 w-full h-full border-0"
              style={{ minHeight: '400px' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 mt-4 py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-slate-600">
            R_50 Signal Engine • 8 Indicators • Ichimoku Primary • 24/7 Auto-Refresh
          </span>
          <div className="flex items-center gap-3 text-[10px] text-slate-600">
            <span>Ticks: <span className="text-blue-400 font-mono">{tickCount}</span></span>
            <span>•</span>
            <span>Candles: <span className="text-blue-400 font-mono">{allCandles.length}</span></span>
            <span>•</span>
            <span>Reconnects: <span className="text-blue-400 font-mono">{reconnectCount}</span></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
