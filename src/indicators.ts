// ─── Types ───────────────────────────────────────────────────────────────────

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
    } else {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
  }
  return result;
}

function highestHigh(highs: number[], period: number, index: number): number {
  let max = -Infinity;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (highs[i] > max) max = highs[i];
  }
  return max;
}

function lowestLow(lows: number[], period: number, index: number): number {
  let min = Infinity;
  const start = Math.max(0, index - period + 1);
  for (let i = start; i <= index; i++) {
    if (lows[i] < min) min = lows[i];
  }
  return min;
}

// ─── Ichimoku Cloud (9, 26, 52) ─────────────────────────────────────────────

export interface IchimokuResult {
  tenkanSen: number;    // Conversion Line (9)
  kijunSen: number;     // Base Line (26)
  senkouSpanA: number;  // Leading Span A (displaced 26 ahead, but we use current)
  senkouSpanB: number;  // Leading Span B (displaced 26 ahead, but we use current)
  chikouSpan: number;   // Lagging Span (close displaced 26 back)
  cloudTop: number;
  cloudBottom: number;
  priceAboveCloud: boolean;
  priceBelowCloud: boolean;
  tkCrossBullish: boolean;
  tkCrossBearish: boolean;
  futureCloudGreen: boolean;
}

export function calcIchimoku(candles: Candle[]): IchimokuResult | null {
  if (candles.length < 52) return null;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const last = candles.length - 1;
  const prev = last - 1;

  // Tenkan-sen (Conversion Line): (highest high + lowest low) / 2 over 9 periods
  const tenkanSen = (highestHigh(highs, 9, last) + lowestLow(lows, 9, last)) / 2;
  const prevTenkan = (highestHigh(highs, 9, prev) + lowestLow(lows, 9, prev)) / 2;

  // Kijun-sen (Base Line): (highest high + lowest low) / 2 over 26 periods
  const kijunSen = (highestHigh(highs, 26, last) + lowestLow(lows, 26, last)) / 2;
  const prevKijun = (highestHigh(highs, 26, prev) + lowestLow(lows, 26, prev)) / 2;

  // Senkou Span A: (Tenkan + Kijun) / 2 — displayed 26 periods ahead
  // For current cloud, use values from 26 periods ago
  const spanAIdx = last - 26;
  let senkouSpanA: number;
  if (spanAIdx >= 26) {
    const t = (highestHigh(highs, 9, spanAIdx) + lowestLow(lows, 9, spanAIdx)) / 2;
    const k = (highestHigh(highs, 26, spanAIdx) + lowestLow(lows, 26, spanAIdx)) / 2;
    senkouSpanA = (t + k) / 2;
  } else {
    senkouSpanA = (tenkanSen + kijunSen) / 2;
  }

  // Senkou Span B: (highest high + lowest low) / 2 over 52 periods — displayed 26 ahead
  const spanBIdx = last - 26;
  let senkouSpanB: number;
  if (spanBIdx >= 52) {
    senkouSpanB = (highestHigh(highs, 52, spanBIdx) + lowestLow(lows, 52, spanBIdx)) / 2;
  } else {
    senkouSpanB = (highestHigh(highs, 52, last) + lowestLow(lows, 52, last)) / 2;
  }

  // Chikou Span: Current close plotted 26 periods back
  const chikouSpan = closes[last];

  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);
  const currentPrice = closes[last];

  // Future cloud (current tenkan/kijun projected)
  const futureSenkouA = (tenkanSen + kijunSen) / 2;
  const futureSenkouB = (highestHigh(highs, 52, last) + lowestLow(lows, 52, last)) / 2;

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan,
    cloudTop,
    cloudBottom,
    priceAboveCloud: currentPrice > cloudTop,
    priceBelowCloud: currentPrice < cloudBottom,
    tkCrossBullish: prevTenkan <= prevKijun && tenkanSen > kijunSen,
    tkCrossBearish: prevTenkan >= prevKijun && tenkanSen < kijunSen,
    futureCloudGreen: futureSenkouA > futureSenkouB,
  };
}

// ─── Bollinger Bands (20, 2) ────────────────────────────────────────────────

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number; // (close - lower) / (upper - lower)
}

export function calcBollinger(candles: Candle[], period = 20, stdDevMultiplier = 2): BollingerResult | null {
  if (candles.length < period) return null;
  const closes = candles.slice(-period).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = mean + stdDevMultiplier * stdDev;
  const lower = mean - stdDevMultiplier * stdDev;
  const close = candles[candles.length - 1].close;
  return {
    upper,
    middle: mean,
    lower,
    bandwidth: (upper - lower) / mean,
    percentB: upper !== lower ? (close - lower) / (upper - lower) : 0.5,
  };
}

// ─── RSI (14) ────────────────────────────────────────────────────────────────

export interface RSIResult {
  value: number;
  overbought: boolean;
  oversold: boolean;
}

export function calcRSI(candles: Candle[], period = 14): RSIResult | null {
  if (candles.length < period + 1) return null;
  const closes = candles.map(c => c.close);
  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothed RSI
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return { value: rsi, overbought: rsi > 70, oversold: rsi < 30 };
}

// ─── Stochastic RSI (14, 14, 3, 3) ─────────────────────────────────────────

export interface StochRSIResult {
  k: number;
  d: number;
  overbought: boolean;
  oversold: boolean;
}

export function calcStochRSI(candles: Candle[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): StochRSIResult | null {
  if (candles.length < rsiPeriod + stochPeriod + dSmooth + 5) return null;

  const closes = candles.map(c => c.close);

  // Calculate full RSI series
  const rsiValues: number[] = [];
  for (let end = rsiPeriod + 1; end <= closes.length; end++) {
    let avgGain = 0;
    let avgLoss = 0;
    const slice = closes.slice(0, end);
    for (let i = 1; i <= rsiPeriod; i++) {
      const diff = slice[i] - slice[i - 1];
      if (diff > 0) avgGain += diff;
      else avgLoss += Math.abs(diff);
    }
    avgGain /= rsiPeriod;
    avgLoss /= rsiPeriod;
    for (let i = rsiPeriod + 1; i < slice.length; i++) {
      const diff = slice[i] - slice[i - 1];
      avgGain = (avgGain * (rsiPeriod - 1) + (diff > 0 ? diff : 0)) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + (diff < 0 ? Math.abs(diff) : 0)) / rsiPeriod;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - 100 / (1 + rs));
  }

  if (rsiValues.length < stochPeriod) return null;

  // Stochastic of RSI
  const rawK: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const maxR = Math.max(...slice);
    const minR = Math.min(...slice);
    rawK.push(maxR === minR ? 50 : ((rsiValues[i] - minR) / (maxR - minR)) * 100);
  }

  // Smooth %K
  const smoothedK = sma(rawK, kSmooth);
  // %D = SMA of smoothed %K
  const dLine = sma(smoothedK, dSmooth);

  const kVal = smoothedK[smoothedK.length - 1];
  const dVal = dLine[dLine.length - 1];

  if (isNaN(kVal) || isNaN(dVal)) return null;

  return {
    k: kVal,
    d: dVal,
    overbought: kVal > 80,
    oversold: kVal < 20,
  };
}

// ─── ATR (14) ────────────────────────────────────────────────────────────────

export interface ATRResult {
  value: number;
  highVolatility: boolean;
  avgATR: number;
}

export function calcATR(candles: Candle[], period = 14): ATRResult | null {
  if (candles.length < period + 1) return null;

  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }

  // Initial ATR = simple average
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Smoothed ATR
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  // Average ATR for comparison (use last 50 ATR values or available)
  const atrHistory: number[] = [];
  let tempAtr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrHistory.push(tempAtr);
  for (let i = period; i < trValues.length; i++) {
    tempAtr = (tempAtr * (period - 1) + trValues[i]) / period;
    atrHistory.push(tempAtr);
  }
  const avgATR = atrHistory.slice(-50).reduce((a, b) => a + b, 0) / Math.min(atrHistory.length, 50);

  return {
    value: atr,
    highVolatility: atr > avgATR * 1.3,
    avgATR,
  };
}

// ─── MACD (12, 26, 9) ──────────────────────────────────────────────────────

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  bullish: boolean;
  bearish: boolean;
  crossoverBullish: boolean;
  crossoverBearish: boolean;
}

export function calcMACD(candles: Candle[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult | null {
  if (candles.length < slowPeriod + signalPeriod) return null;
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = ema(macdLine, signalPeriod);
  const last = closes.length - 1;
  const prev = last - 1;

  const macdVal = macdLine[last];
  const signalVal = signalLine[last];
  const histogram = macdVal - signalVal;

  const prevMacd = macdLine[prev];
  const prevSignal = signalLine[prev];

  return {
    macd: macdVal,
    signal: signalVal,
    histogram,
    bullish: macdVal > signalVal,
    bearish: macdVal < signalVal,
    crossoverBullish: prevMacd <= prevSignal && macdVal > signalVal,
    crossoverBearish: prevMacd >= prevSignal && macdVal < signalVal,
  };
}

// ─── Moving Average (EMA 20 & EMA 50) ──────────────────────────────────────

export interface MAResult {
  ema20: number;
  ema50: number;
  priceAboveEma20: boolean;
  priceAboveEma50: boolean;
  ema20AboveEma50: boolean;
  goldenCross: boolean;
  deathCross: boolean;
}

export function calcMA(candles: Candle[]): MAResult | null {
  if (candles.length < 52) return null;
  const closes = candles.map(c => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const last = closes.length - 1;
  const prev = last - 1;
  const price = closes[last];

  return {
    ema20: ema20[last],
    ema50: ema50[last],
    priceAboveEma20: price > ema20[last],
    priceAboveEma50: price > ema50[last],
    ema20AboveEma50: ema20[last] > ema50[last],
    goldenCross: ema20[prev] <= ema50[prev] && ema20[last] > ema50[last],
    deathCross: ema20[prev] >= ema50[prev] && ema20[last] < ema50[last],
  };
}

// ─── ADX (14) ────────────────────────────────────────────────────────────────

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  strongTrend: boolean;
  bullishDI: boolean;
}

// ─── Support & Resistance (2m swing levels) ────────────────────────────────

export interface SupportResistanceResult {
  support: number;
  resistance: number;
  nearestDistanceToSupportPct: number;
  nearestDistanceToResistancePct: number;
  bullishBounceZone: boolean;
  bearishRejectionZone: boolean;
  rangeWidthPct: number;
}

export function calcSupportResistance(candles: Candle[], lookback = 30): SupportResistanceResult | null {
  if (candles.length < Math.max(lookback, 20)) return null;

  const slice = candles.slice(-lookback);
  const highs = slice.map(c => c.high);
  const lows = slice.map(c => c.low);
  const close = candles[candles.length - 1].close;

  const support = Math.min(...lows);
  const resistance = Math.max(...highs);
  const range = resistance - support;

  if (range <= 0 || close <= 0) return null;

  const distanceToSupport = Math.abs(close - support);
  const distanceToResistance = Math.abs(resistance - close);
  const nearestDistanceToSupportPct = (distanceToSupport / close) * 100;
  const nearestDistanceToResistancePct = (distanceToResistance / close) * 100;

  // 12% of channel used as "near level" zone, capped by relative price distance
  const nearLevelThreshold = range * 0.12;

  return {
    support,
    resistance,
    nearestDistanceToSupportPct,
    nearestDistanceToResistancePct,
    bullishBounceZone: distanceToSupport <= nearLevelThreshold,
    bearishRejectionZone: distanceToResistance <= nearLevelThreshold,
    rangeWidthPct: (range / close) * 100,
  };
}

export function calcADX(candles: Candle[], period = 14): ADXResult | null {
  if (candles.length < period * 3) return null;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trArr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trArr.push(tr);
  }

  // Smoothed values
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothTR = trArr.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trArr.length; i++) {
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    smoothTR = smoothTR - smoothTR / period + trArr[i];

    const pdi = smoothTR !== 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const mdi = smoothTR !== 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    const diDiff = Math.abs(pdi - mdi);
    const diSum = pdi + mdi;
    const dx = diSum !== 0 ? (diDiff / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;

  // ADX = smoothed DX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  // Current +DI and -DI
  const lastPDI = smoothTR !== 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
  const lastMDI = smoothTR !== 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

  return {
    adx,
    plusDI: lastPDI,
    minusDI: lastMDI,
    strongTrend: adx > 25,
    bullishDI: lastPDI > lastMDI,
  };
}

// ─── Shared Generic Helpers for New Setups ─────────────────────────────────

export function calcEMAValues(candles: Candle[], period: number): number[] {
  if (candles.length === 0) return [];
  const closes = candles.map(c => c.close);
  return ema(closes, period);
}

export function calcRSISeries(candles: Candle[], period: number): number[] {
  if (candles.length < period + 1) return [];

  const closes = candles.map(c => c.close);
  const rsiSeries: number[] = new Array(candles.length).fill(NaN);

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiSeries[period] = 100 - 100 / (1 + firstRS);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiSeries[i] = 100 - 100 / (1 + rs);
  }

  return rsiSeries;
}

export interface StochasticResult {
  k: number;
  d: number;
  previousK: number;
  previousD: number;
}

export function calcStochastic(
  candles: Candle[],
  kPeriod = 5,
  dPeriod = 3,
  slowing = 3
): StochasticResult | null {
  if (candles.length < kPeriod + dPeriod + slowing) return null;

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const rawK: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(NaN);
      continue;
    }

    const hh = highestHigh(highs, kPeriod, i);
    const ll = lowestLow(lows, kPeriod, i);
    rawK.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }

  const filteredRawK = rawK.filter(v => !Number.isNaN(v));
  const smoothK = sma(filteredRawK, slowing).filter(v => !Number.isNaN(v));
  const dLine = sma(smoothK, dPeriod).filter(v => !Number.isNaN(v));

  if (smoothK.length < 2 || dLine.length < 2) return null;

  const k = smoothK[smoothK.length - 1];
  const previousK = smoothK[smoothK.length - 2];
  const d = dLine[dLine.length - 1];
  const previousD = dLine[dLine.length - 2];

  return { k, d, previousK, previousD };
}

export interface MACDSeriesResult {
  macd: number;
  signal: number;
  histogram: number;
  previousMacd: number;
  previousSignal: number;
  previousHistogram: number;
}

export function calcMACDSeries(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDSeriesResult | null {
  if (candles.length < slowPeriod + signalPeriod + 2) return null;

  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signalPeriod);

  const last = macdLine.length - 1;
  const prev = last - 1;

  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
    previousMacd: macdLine[prev],
    previousSignal: signalLine[prev],
    previousHistogram: macdLine[prev] - signalLine[prev],
  };
}

export interface SRLevelResult {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export function calcSwingSupportResistance(
  candles: Candle[],
  lookback = 100,
  touchTolerancePct = 0.05,
  minTouches = 2
): SRLevelResult {
  const slice = candles.slice(-lookback);
  if (slice.length < 10) {
    return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
  }

  const groups: { level: number; touches: number }[] = [];

  const groupLevel = (price: number) => {
    const tolerance = price * (touchTolerancePct / 100);
    const existing = groups.find(g => Math.abs(g.level - price) <= tolerance);
    if (existing) {
      existing.level = (existing.level * existing.touches + price) / (existing.touches + 1);
      existing.touches += 1;
    } else {
      groups.push({ level: price, touches: 1 });
    }
  };

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    const prev = slice[i - 1];
    const next = slice[i + 1];

    if (c.low <= prev.low && c.low <= next.low) groupLevel(c.low);
    if (c.high >= prev.high && c.high >= next.high) groupLevel(c.high);
  }

  const valid = groups.filter(g => g.touches >= minTouches).map(g => g.level).sort((a, b) => a - b);
  const close = slice[slice.length - 1].close;

  const supports = valid.filter(v => v <= close);
  const resistances = valid.filter(v => v >= close);

  return {
    supports,
    resistances,
    nearestSupport: supports.length ? supports[supports.length - 1] : null,
    nearestResistance: resistances.length ? resistances[0] : null,
  };
}
