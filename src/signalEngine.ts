import type { Candle } from './indicators';
import {
  calcIchimoku,
  type IchimokuResult,
  type BollingerResult,
  type RSIResult,
  type StochRSIResult,
  type ATRResult,
  type MACDResult,
  type MAResult,
  type ADXResult,
  type SupportResistanceResult,
} from './indicators';

export type SignalDirection = 'RISE' | 'FALL' | 'NEUTRAL';
export type SignalStrength =
  | 'STRONG RISE'
  | 'RISE'
  | 'WEAK RISE'
  | 'NEUTRAL'
  | 'WEAK FALL'
  | 'FALL'
  | 'STRONG FALL';

export interface IndicatorSignal {
  name: string;
  direction: 'RISE' | 'FALL' | 'NEUTRAL';
  confidence: number;
  detail: string;
  weight: number;
  isStrongSignal?: boolean;
}

export interface SignalResult {
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  indicators: IndicatorSignal[];
  riseCount: number;
  fallCount: number;
  neutralCount: number;
  timestamp: number;
  ichimoku: IchimokuResult | null;
  bollinger: BollingerResult | null;
  rsi: RSIResult | null;
  stochRSI: StochRSIResult | null;
  atr: ATRResult | null;
  macd: MACDResult | null;
  ma: MAResult | null;
  adx: ADXResult | null;
  supportResistance: SupportResistanceResult | null;
  reason: string;
}

type SetupContext = {
  candles: Candle[];
  closes: number[];
  last: number;
  prev: number;
  ema5: number[];
  ema9: number[];
  ema13: number[];
  ema21: number[];
  ema50: number[];
  rsi3: number[];
  rsi6: number[];
  rsi7: number[];
  stochastic: { k: number[]; d: number[] };
  levels: { supports: Level[]; resistances: Level[] };
};

type Level = { value: number; touches: number };

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  const multiplier = 2 / (period + 1);
  for (let i = 1; i < values.length; i++) {
    const ema = (values[i] - out[i - 1]) * multiplier + out[i - 1];
    out.push(ema);
  }
  return out;
}

function rsiSeries(values: number[], period: number): number[] {
  if (values.length < period + 1) return [];
  const result = new Array(values.length).fill(NaN);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + firstRs);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

function smaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function stochasticSeries(candles: Candle[], kPeriod = 5, dPeriod = 3, slowing = 3): { k: number[]; d: number[] } {
  const rawK: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(NaN);
      continue;
    }

    const window = candles.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...window.map(c => c.high));
    const lowestLow = Math.min(...window.map(c => c.low));
    const close = candles[i].close;
    const k = highestHigh === lowestLow ? 50 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
    rawK.push(k);
  }

  const slowedK = smaSeries(rawK, slowing);
  const d = smaSeries(slowedK, dPeriod);
  return { k: slowedK, d };
}

function detectKeyLevels(candles: Candle[], lookback = 100): { supports: Level[]; resistances: Level[] } {
  const data = candles.slice(-lookback);
  if (data.length < 20) return { supports: [], resistances: [] };

  const swingLows: number[] = [];
  const swingHighs: number[] = [];
  for (let i = 2; i < data.length - 2; i++) {
    const c = data[i];
    if (c.low <= data[i - 1].low && c.low <= data[i - 2].low && c.low <= data[i + 1].low && c.low <= data[i + 2].low) {
      swingLows.push(c.low);
    }
    if (c.high >= data[i - 1].high && c.high >= data[i - 2].high && c.high >= data[i + 1].high && c.high >= data[i + 2].high) {
      swingHighs.push(c.high);
    }
  }

  const clusterLevels = (points: number[]): Level[] => {
    const levels: Level[] = [];
    for (const point of points) {
      const existing = levels.find(level => Math.abs(point - level.value) / level.value <= 0.0005);
      if (existing) {
        existing.value = (existing.value * existing.touches + point) / (existing.touches + 1);
        existing.touches += 1;
      } else {
        levels.push({ value: point, touches: 1 });
      }
    }
    return levels.filter(level => level.touches >= 2);
  };

  return {
    supports: clusterLevels(swingLows),
    resistances: clusterLevels(swingHighs),
  };
}

function isNearLevel(price: number, level: number, thresholdPct = 0.1): boolean {
  return Math.abs(price - level) / level <= thresholdPct / 100;
}

function trapCandle(candle: Candle): { bearishTrap: boolean; bullishTrap: boolean } {
  const body = Math.max(Math.abs(candle.close - candle.open), 0.00001);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  return {
    bearishTrap: upperWick >= body * 2 && lowerWick <= body,
    bullishTrap: lowerWick >= body * 2 && upperWick <= body,
  };
}

function buildIchimokuSignal(ichimoku: IchimokuResult | null): IndicatorSignal {
  // ─── 1. ICHIMOKU CLOUD (Primary - weight 2.0) ──────────────────────────

  if (ichimoku) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (ichimoku.priceAboveCloud) {
      direction = 'RISE';
      confidence += 20;
      details.push('Price above cloud');
    } else if (ichimoku.priceBelowCloud) {
      direction = 'FALL';
      confidence += 20;
      details.push('Price below cloud');
    } else {
      details.push('Price inside cloud');
      confidence = 30;
    }

    if (ichimoku.tkCrossBullish) {
      direction = 'RISE';
      confidence += 20;
      details.push('TK Cross ↑');
    } else if (ichimoku.tkCrossBearish) {
      direction = 'FALL';
      confidence += 20;
      details.push('TK Cross ↓');
    }

    if (ichimoku.tenkanSen > ichimoku.kijunSen && direction === 'RISE') {
      confidence += 10;
      details.push('Tenkan > Kijun');
    } else if (ichimoku.tenkanSen < ichimoku.kijunSen && direction === 'FALL') {
      confidence += 10;
      details.push('Tenkan < Kijun');
    }

    if (ichimoku.futureCloudGreen && direction === 'RISE') {
      confidence += 5;
      details.push('Future cloud green');
    } else if (!ichimoku.futureCloudGreen && direction === 'FALL') {
      confidence += 5;
      details.push('Future cloud red');
    }

    return {
      name: 'Ichimoku Cloud',
      direction,
      confidence: Math.min(confidence, 95),
      detail: details.join(' · '),
      weight: 2.0,
    };
  }

  return {
    name: 'Ichimoku Cloud',
    direction: 'NEUTRAL',
    confidence: 0,
    detail: 'Insufficient candles',
    weight: 2.0,
  };
}

function setup1RsiMaSr(ctx: SetupContext): IndicatorSignal {
  const currentPrice = ctx.closes[ctx.last];
  const rsi7Now = ctx.rsi7[ctx.last];
  const nearSupport = ctx.levels.supports.some(level => isNearLevel(currentPrice, level.value, 0.1));
  const nearResistance = ctx.levels.resistances.some(level => isNearLevel(currentPrice, level.value, 0.1));

  let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (nearSupport && rsi7Now < 25 && currentPrice > ctx.ema21[ctx.last]) direction = 'RISE';
  else if (nearResistance && rsi7Now > 75 && currentPrice < ctx.ema21[ctx.last]) direction = 'FALL';

  return {
    name: 'Setup 1: RSI + MA + S/R L',
    direction,
    confidence: direction === 'NEUTRAL' ? 35 : 78,
    detail: `RSI7 ${isNaN(rsi7Now) ? 'n/a' : rsi7Now.toFixed(1)} · EMA21 ${ctx.ema21[ctx.last].toFixed(2)} · S:${ctx.levels.supports.length} R:${ctx.levels.resistances.length}`,
    weight: 1,
  };
}

function setup2EmaStochastic(ctx: SetupContext): IndicatorSignal {
  const kNow = ctx.stochastic.k[ctx.last];
  const dNow = ctx.stochastic.d[ctx.last];
  const kPrev = ctx.stochastic.k[ctx.prev];
  const dPrev = ctx.stochastic.d[ctx.prev];

  const bullishEmaCross = ctx.ema5[ctx.prev] <= ctx.ema13[ctx.prev] && ctx.ema5[ctx.last] > ctx.ema13[ctx.last];
  const bearishEmaCross = ctx.ema5[ctx.prev] >= ctx.ema13[ctx.prev] && ctx.ema5[ctx.last] < ctx.ema13[ctx.last];
  const bullishStochCross = kPrev <= dPrev && kNow > dNow;
  const bearishStochCross = kPrev >= dPrev && kNow < dNow;

  let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishEmaCross && kNow < 20 && bullishStochCross) direction = 'RISE';
  else if (bearishEmaCross && kNow > 80 && bearishStochCross) direction = 'FALL';

  return {
    name: 'Setup 2: EMA Crossover & Stochastic',
    direction,
    confidence: direction === 'NEUTRAL' ? 35 : 80,
    detail: `EMA5/13 ${ctx.ema5[ctx.last].toFixed(2)}/${ctx.ema13[ctx.last].toFixed(2)} · K/D ${isNaN(kNow) ? 'n/a' : kNow.toFixed(1)}/${isNaN(dNow) ? 'n/a' : dNow.toFixed(1)}`,
    weight: 1,
  };
}

function setup3TrendFilter(ctx: SetupContext): IndicatorSignal {
  const currentPrice = ctx.closes[ctx.last];
  const macdFast = emaSeries(ctx.closes, 6);
  const macdSlow = emaSeries(ctx.closes, 13);
  const macdLine = ctx.closes.map((_, i) => macdFast[i] - macdSlow[i]);
  const signalLine = emaSeries(macdLine, 5);

  const histPrev = macdLine[ctx.prev] - signalLine[ctx.prev];
  const histNow = macdLine[ctx.last] - signalLine[ctx.last];
  const bullCross = macdLine[ctx.prev] <= signalLine[ctx.prev] && macdLine[ctx.last] > signalLine[ctx.last];
  const bearCross = macdLine[ctx.prev] >= signalLine[ctx.prev] && macdLine[ctx.last] < signalLine[ctx.last];

  let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (currentPrice > ctx.ema50[ctx.last] && histPrev <= 0 && histNow > 0 && bullCross) direction = 'RISE';
  else if (currentPrice < ctx.ema50[ctx.last] && histPrev >= 0 && histNow < 0 && bearCross) direction = 'FALL';

  const ema50Rising = ctx.ema50[ctx.last] > ctx.ema50[ctx.prev];
  const ema21Rising = ctx.ema21[ctx.last] > ctx.ema21[ctx.prev];
  const trendAgreeBull = ema50Rising && ema21Rising;
  const trendAgreeBear = !ema50Rising && !ema21Rising;

  const nearSupport = ctx.levels.supports.some(level => isNearLevel(currentPrice, level.value, 0.1));
  const nearResistance = ctx.levels.resistances.some(level => isNearLevel(currentPrice, level.value, 0.1));

  const kNow = ctx.stochastic.k[ctx.last];
  const dNow = ctx.stochastic.d[ctx.last];
  const kPrev = ctx.stochastic.k[ctx.prev];
  const dPrev = ctx.stochastic.d[ctx.prev];
  const bullishStoch = kPrev <= dPrev && kNow > dNow;
  const bearishStoch = kPrev >= dPrev && kNow < dNow;

  const oscBull = ctx.rsi7[ctx.last] < 30 || (kNow < 20 && bullishStoch);
  const oscBear = ctx.rsi7[ctx.last] > 70 || (kNow > 80 && bearishStoch);

  const isStrongSignal =
    (direction === 'RISE' && trendAgreeBull && nearSupport && oscBull) ||
    (direction === 'FALL' && trendAgreeBear && nearResistance && oscBear);

  return {
    name: 'Setup 3: Trend Filter',
    direction,
    confidence: direction === 'NEUTRAL' ? 35 : isStrongSignal ? 90 : 82,
    detail: `MACD6/13/5 hist ${histNow.toFixed(4)} · EMA50 ${ctx.ema50[ctx.last].toFixed(2)}${isStrongSignal ? ' · STRONG' : ''}`,
    weight: 1,
    isStrongSignal,
  };
}

function setup4ScalpMachine(ctx: SetupContext): IndicatorSignal {
  const prevCandle = ctx.candles[ctx.prev];
  const currentCandle = ctx.candles[ctx.last];

  const rsiCrossUp = ctx.rsi3[ctx.prev] < 50 && ctx.rsi3[ctx.last] >= 50;
  const rsiCrossDown = ctx.rsi3[ctx.prev] > 50 && ctx.rsi3[ctx.last] <= 50;

  const prevRed = prevCandle.close < prevCandle.open;
  const prevGreen = prevCandle.close > prevCandle.open;
  const currentGreen = currentCandle.close > currentCandle.open;
  const currentRed = currentCandle.close < currentCandle.open;

  let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (currentCandle.close > ctx.ema9[ctx.last] && rsiCrossUp && prevRed && currentGreen) direction = 'RISE';
  else if (currentCandle.close < ctx.ema9[ctx.last] && rsiCrossDown && prevGreen && currentRed) direction = 'FALL';

  return {
    name: 'Setup 4: Scalp Machine',
    direction,
    confidence: direction === 'NEUTRAL' ? 35 : 76,
    detail: `RSI3 ${isNaN(ctx.rsi3[ctx.last]) ? 'n/a' : ctx.rsi3[ctx.last].toFixed(1)} · EMA9 ${ctx.ema9[ctx.last].toFixed(2)}`,
    weight: 1,
  };
}

function setup5CandleTrap(ctx: SetupContext): IndicatorSignal {
  const current = ctx.candles[ctx.last];
  const trap = trapCandle(current);
  const rsi6Now = ctx.rsi6[ctx.last];

  const recent = ctx.candles.slice(Math.max(0, ctx.last - 5), ctx.last + 1);
  let lowerLows = 0;
  let higherHighs = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].low < recent[i - 1].low) lowerLows += 1;
    if (recent[i].high > recent[i - 1].high) higherHighs += 1;
  }

  const lookback = ctx.candles.slice(Math.max(0, ctx.last - 20), ctx.last + 1);
  const lowest = Math.min(...lookback.map(c => c.low));
  const highest = Math.max(...lookback.map(c => c.high));

  const riseTrap =
    trap.bullishTrap &&
    current.close <= ctx.ema21[ctx.last] * 1.001 &&
    rsi6Now >= 25 &&
    rsi6Now <= 40 &&
    lowerLows >= 3 &&
    current.low >= lowest;

  const fallTrap =
    trap.bearishTrap &&
    current.close >= ctx.ema21[ctx.last] * 0.999 &&
    rsi6Now >= 60 &&
    rsi6Now <= 75 &&
    higherHighs >= 3 &&
    current.high <= highest;

  let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (riseTrap) direction = 'RISE';
  else if (fallTrap) direction = 'FALL';

  return {
    name: 'Setup 5: The Candle Trap',
    direction,
    confidence: direction === 'NEUTRAL' ? 35 : 84,
    detail: `RSI6 ${isNaN(rsi6Now) ? 'n/a' : rsi6Now.toFixed(1)} · ${trap.bullishTrap ? 'Bull trap' : trap.bearishTrap ? 'Bear trap' : 'No trap'}`,
    weight: 1,
  };
}

export function generateSignal(candles: Candle[]): SignalResult {
  const closes = candles.map(c => c.close);
  const last = closes.length - 1;
  const prev = last - 1;

  const ichimoku = calcIchimoku(candles);
  const indicators: IndicatorSignal[] = [buildIchimokuSignal(ichimoku)];

  const context: SetupContext = {
    candles,
    closes,
    last,
    prev,
    ema5: emaSeries(closes, 5),
    ema9: emaSeries(closes, 9),
    ema13: emaSeries(closes, 13),
    ema21: emaSeries(closes, 21),
    ema50: emaSeries(closes, 50),
    rsi3: rsiSeries(closes, 3),
    rsi6: rsiSeries(closes, 6),
    rsi7: rsiSeries(closes, 7),
    stochastic: stochasticSeries(candles, 5, 3, 3),
    levels: detectKeyLevels(candles, 100),
  };

  indicators.push(setup1RsiMaSr(context));
  indicators.push(setup2EmaStochastic(context));
  indicators.push(setup3TrendFilter(context));
  indicators.push(setup4ScalpMachine(context));
  indicators.push(setup5CandleTrap(context));

  const riseCount = indicators.filter(i => i.direction === 'RISE').length;
  const fallCount = indicators.filter(i => i.direction === 'FALL').length;
  const neutralCount = indicators.filter(i => i.direction === 'NEUTRAL').length;

  let direction: SignalDirection = 'NEUTRAL';
  let strength: SignalStrength = 'NEUTRAL';
  if (riseCount > fallCount) {
    direction = 'RISE';
    if (riseCount >= 5) strength = 'STRONG RISE';
    else if (riseCount === 4) strength = 'RISE';
    else strength = 'WEAK RISE';
  } else if (fallCount > riseCount) {
    direction = 'FALL';
    if (fallCount >= 5) strength = 'STRONG FALL';
    else if (fallCount === 4) strength = 'FALL';
    else strength = 'WEAK FALL';
  }

  const agreement = Math.max(riseCount, fallCount);

  return {
    direction,
    strength,
    confidence: agreement,
    indicators,
    riseCount,
    fallCount,
    neutralCount,
    timestamp: Date.now(),
    ichimoku,
    bollinger: null,
    rsi: null,
    stochRSI: null,
    atr: null,
    macd: null,
    ma: null,
    adx: null,
    supportResistance: null,
    reason: `${riseCount}/6 RISE vs ${fallCount}/6 FALL`,
  };
}
