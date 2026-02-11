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

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  const k = 2 / (period + 1);
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
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
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

function smaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) out.push(NaN);
    else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      out.push(sum / period);
    }
  }
  return out;
}

function stochasticSeries(candles: Candle[], kPeriod = 5, dPeriod = 3, slowing = 3) {
  if (candles.length < kPeriod + dPeriod + slowing) return { k: [], d: [] };
  const rawK: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(NaN);
      continue;
    }
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...slice.map(c => c.high));
    const ll = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    rawK.push(hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100);
  }
  const slowK = smaSeries(rawK, slowing);
  const d = smaSeries(slowK, dPeriod);
  return { k: slowK, d };
}

type Level = { value: number; touches: number };

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
    for (const p of points) {
      const match = levels.find(l => Math.abs(p - l.value) / l.value <= 0.001);
      if (match) {
        match.value = (match.value * match.touches + p) / (match.touches + 1);
        match.touches += 1;
      } else levels.push({ value: p, touches: 1 });
    }
    return levels.filter(l => l.touches >= 2);
  };

  return { supports: clusterLevels(swingLows), resistances: clusterLevels(swingHighs) };
}

function isNearLevel(price: number, level: number, thresholdPct = 0.1): boolean {
  return Math.abs(price - level) / level <= thresholdPct / 100;
}

function trapCandle(c: Candle) {
  const body = Math.max(Math.abs(c.close - c.open), 0.00001);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return {
    bearishTrap: upperWick >= body * 2 && lowerWick <= body,
    bullishTrap: lowerWick >= body * 2 && upperWick <= body,
  };
}

export function generateSignal(candles: Candle[]): SignalResult {
  const indicators: IndicatorSignal[] = [];
  const closes = candles.map(c => c.close);
  const last = candles.length - 1;
  const prev = last - 1;
  const currentPrice = closes[last];

  const ichimoku = calcIchimoku(candles);

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

    indicators.push({
      name: 'Ichimoku Cloud',
      direction,
      confidence: Math.min(confidence, 95),
      detail: details.join(' · '),
      weight: 2.0,
    });
  } else {
    indicators.push({
      name: 'Ichimoku Cloud',
      direction: 'NEUTRAL',
      confidence: 0,
      detail: 'Insufficient candles',
      weight: 2.0,
    });
  }

  // Setup 1: RSI + MA + S/R L
  const rsi7 = rsiSeries(closes, 7);
  const ema21 = emaSeries(closes, 21);
  const levels = detectKeyLevels(candles, 100);
  const nearSupport = levels.supports.some(l => isNearLevel(currentPrice, l.value, 0.1));
  const nearResistance = levels.resistances.some(l => isNearLevel(currentPrice, l.value, 0.1));
  const rsi7Now = rsi7[last];
  let s1Direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (nearSupport && rsi7Now < 25 && currentPrice > ema21[last]) s1Direction = 'RISE';
  else if (nearResistance && rsi7Now > 75 && currentPrice < ema21[last]) s1Direction = 'FALL';
  indicators.push({
    name: 'Setup 1: RSI + MA + S/R L',
    direction: s1Direction,
    confidence: s1Direction === 'NEUTRAL' ? 35 : 78,
    detail: `RSI7 ${isNaN(rsi7Now) ? 'n/a' : rsi7Now.toFixed(1)} · EMA21 ${ema21[last].toFixed(2)} · S:${levels.supports.length} R:${levels.resistances.length}`,
    weight: 1,
  });

  // Setup 2: EMA Crossover & Stochastic
  const ema5 = emaSeries(closes, 5);
  const ema13 = emaSeries(closes, 13);
  const stoch = stochasticSeries(candles, 5, 3, 3);
  const kNow = stoch.k[last];
  const dNow = stoch.d[last];
  const kPrev = stoch.k[prev];
  const dPrev = stoch.d[prev];
  const bullishEmaCross = ema5[prev] <= ema13[prev] && ema5[last] > ema13[last];
  const bearishEmaCross = ema5[prev] >= ema13[prev] && ema5[last] < ema13[last];
  const bullishStochCross = kPrev <= dPrev && kNow > dNow;
  const bearishStochCross = kPrev >= dPrev && kNow < dNow;
  let s2Direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishEmaCross && kNow < 20 && bullishStochCross) s2Direction = 'RISE';
  else if (bearishEmaCross && kNow > 80 && bearishStochCross) s2Direction = 'FALL';
  indicators.push({
    name: 'Setup 2: EMA Crossover & Stochastic',
    direction: s2Direction,
    confidence: s2Direction === 'NEUTRAL' ? 35 : 80,
    detail: `EMA5/13 ${ema5[last].toFixed(2)}/${ema13[last].toFixed(2)} · K/D ${isNaN(kNow) ? 'n/a' : kNow.toFixed(1)}/${isNaN(dNow) ? 'n/a' : dNow.toFixed(1)}`,
    weight: 1,
  });

  // Setup 3: Trend Filter (MACD 6/13/5 + EMA50)
  const ema50 = emaSeries(closes, 50);
  const macdFast = emaSeries(closes, 6);
  const macdSlow = emaSeries(closes, 13);
  const macdLine = closes.map((_, i) => macdFast[i] - macdSlow[i]);
  const macdSignal = emaSeries(macdLine, 5);
  const histNow = macdLine[last] - macdSignal[last];
  const histPrev = macdLine[prev] - macdSignal[prev];
  const macdBullCross = macdLine[prev] <= macdSignal[prev] && macdLine[last] > macdSignal[last];
  const macdBearCross = macdLine[prev] >= macdSignal[prev] && macdLine[last] < macdSignal[last];

  let s3Direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (currentPrice > ema50[last] && histPrev <= 0 && histNow > 0 && macdBullCross) s3Direction = 'RISE';
  else if (currentPrice < ema50[last] && histPrev >= 0 && histNow < 0 && macdBearCross) s3Direction = 'FALL';

  const ema50Rising = ema50[last] > ema50[prev];
  const ema21Rising = ema21[last] > ema21[prev];
  const trendAgreeBull = ema50Rising && ema21Rising;
  const trendAgreeBear = !ema50Rising && !ema21Rising;
  const pulledToSupport = nearSupport;
  const pulledToResistance = nearResistance;
  const oscBullConfirm = rsi7Now < 30 || (kNow < 20 && bullishStochCross);
  const oscBearConfirm = rsi7Now > 70 || (kNow > 80 && bearishStochCross);
  const isStrongSignal =
    (s3Direction === 'RISE' && trendAgreeBull && pulledToSupport && oscBullConfirm) ||
    (s3Direction === 'FALL' && trendAgreeBear && pulledToResistance && oscBearConfirm);

  indicators.push({
    name: 'Setup 3: Trend Filter',
    direction: s3Direction,
    confidence: s3Direction === 'NEUTRAL' ? 35 : isStrongSignal ? 90 : 82,
    detail: `MACD hist ${histNow.toFixed(4)} · EMA50 ${ema50[last].toFixed(2)}${isStrongSignal ? ' · STRONG' : ''}`,
    weight: 1,
    isStrongSignal,
  });

  // Setup 4: Scalp Machine
  const ema9 = emaSeries(closes, 9);
  const rsi3 = rsiSeries(closes, 3);
  const prevC = candles[prev];
  const curC = candles[last];
  const rsi3CrossUp = rsi3[prev] < 50 && rsi3[last] >= 50;
  const rsi3CrossDown = rsi3[prev] > 50 && rsi3[last] <= 50;
  const prevRed = prevC.close < prevC.open;
  const prevGreen = prevC.close > prevC.open;
  const currGreen = curC.close > curC.open;
  const currRed = curC.close < curC.open;

  let s4Direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (curC.close > ema9[last] && rsi3CrossUp && prevRed && currGreen) s4Direction = 'RISE';
  else if (curC.close < ema9[last] && rsi3CrossDown && prevGreen && currRed) s4Direction = 'FALL';

  indicators.push({
    name: 'Setup 4: Scalp Machine',
    direction: s4Direction,
    confidence: s4Direction === 'NEUTRAL' ? 35 : 76,
    detail: `RSI3 ${isNaN(rsi3[last]) ? 'n/a' : rsi3[last].toFixed(1)} · EMA9 ${ema9[last].toFixed(2)}`,
    weight: 1,
  });

  // Setup 5: The Candle Trap
  const trap = trapCandle(curC);
  const rsi6 = rsiSeries(closes, 6);
  const rsi6Now = rsi6[last];
  const prev5 = candles.slice(Math.max(0, last - 5), last + 1);
  let lowerLows = 0;
  let higherHighs = 0;
  for (let i = 1; i < prev5.length; i++) {
    if (prev5[i].low < prev5[i - 1].low) lowerLows++;
    if (prev5[i].high > prev5[i - 1].high) higherHighs++;
  }
  const lookback20 = candles.slice(Math.max(0, last - 20), last + 1);
  const lowest20 = Math.min(...lookback20.map(c => c.low));
  const highest20 = Math.max(...lookback20.map(c => c.high));

  const riseTrap =
    trap.bullishTrap &&
    curC.close <= ema21[last] * 1.001 &&
    rsi6Now >= 25 &&
    rsi6Now <= 40 &&
    lowerLows >= 3 &&
    curC.low >= lowest20;

  const fallTrap =
    trap.bearishTrap &&
    curC.close >= ema21[last] * 0.999 &&
    rsi6Now >= 60 &&
    rsi6Now <= 75 &&
    higherHighs >= 3 &&
    curC.high <= highest20;

  let s5Direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
  if (riseTrap) s5Direction = 'RISE';
  else if (fallTrap) s5Direction = 'FALL';

  indicators.push({
    name: 'Setup 5: The Candle Trap',
    direction: s5Direction,
    confidence: s5Direction === 'NEUTRAL' ? 35 : 84,
    detail: `RSI6 ${isNaN(rsi6Now) ? 'n/a' : rsi6Now.toFixed(1)} · ${trap.bullishTrap ? 'Bull trap' : trap.bearishTrap ? 'Bear trap' : 'No trap'}`,
    weight: 1,
  });

  const riseCount = indicators.filter(i => i.direction === 'RISE').length;
  const fallCount = indicators.filter(i => i.direction === 'FALL').length;
  const neutralCount = indicators.filter(i => i.direction === 'NEUTRAL').length;

  let direction: SignalDirection = 'NEUTRAL';
  let strength: SignalStrength = 'NEUTRAL';
  let reason = `${riseCount}/6 RISE vs ${fallCount}/6 FALL`;

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

  const confidence = Math.round((Math.max(riseCount, fallCount) / 6) * 100);

  return {
    direction,
    strength,
    confidence,
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
    reason,
  };
}
