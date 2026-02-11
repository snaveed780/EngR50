import type { Candle, IchimokuResult, SRLevelResult, StochasticResult, MACDSeriesResult } from './indicators';
import {
  calcIchimoku,
  calcEMAValues,
  calcRSISeries,
  calcStochastic,
  calcMACDSeries,
  calcSwingSupportResistance,
} from './indicators';

export type SignalDirection = 'RISE' | 'FALL' | 'NEUTRAL';
export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

export interface IndicatorSignal {
  name: string;
  direction: SignalDirection;
  confidence: number;
  detail: string;
  weight: number;
  isStrongSignal?: boolean;
  values?: Record<string, number | string | boolean | null>;
}

export interface SignalResult {
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  confidenceScore: string;
  combinedLabel: 'STRONG RISE' | 'RISE' | 'WEAK RISE' | 'NEUTRAL' | 'WEAK FALL' | 'FALL' | 'STRONG FALL';
  indicators: IndicatorSignal[];
  riseCount: number;
  fallCount: number;
  neutralCount: number;
  timestamp: number;
  ichimoku: IchimokuResult | null;
  supportResistance: SRLevelResult;
  stochastic: StochasticResult | null;
  macdTrend: MACDSeriesResult | null;
  ema21: number | null;
  ema50: number | null;
  rsi7: number | null;
  reason: string;
}

function isNearLevel(price: number, level: number | null, pct = 0.1): boolean {
  if (!level || price <= 0) return false;
  return Math.abs(price - level) / price <= pct / 100;
}

function isBullishTrapCandle(candle: Candle): boolean {
  const body = Math.max(Math.abs(candle.close - candle.open), 1e-9);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  return lowerWick >= body * 2 && upperWick <= body;
}

function isBearishTrapCandle(candle: Candle): boolean {
  const body = Math.max(Math.abs(candle.close - candle.open), 1e-9);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  return upperWick >= body * 2 && lowerWick <= body;
}

function hasStrongBullishBody(candle: Candle): boolean {
  const range = Math.max(candle.high - candle.low, 1e-9);
  const body = candle.close - candle.open;
  return body > 0 && body / range >= 0.6;
}

function hasStrongBearishBody(candle: Candle): boolean {
  const range = Math.max(candle.high - candle.low, 1e-9);
  const body = candle.open - candle.close;
  return body > 0 && body / range >= 0.6;
}

function getBodySize(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

type CandleTrapGrade = 'A+' | 'A' | 'B' | 'C' | null;

interface CandleTrapSetupResult {
  signal: SignalDirection;
  setupName: 'The Candle Trap';
  grade: CandleTrapGrade;
  confidence: number;
  entryPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  indicators: Record<string, number | string | boolean | null>;
  reason: string;
}

function detectCandleTrap(candles: Candle[], ema21Array: number[], rsi6Array: number[]): CandleTrapSetupResult {
  const neutralResult = (reason: string, indicators: Record<string, number | string | boolean | null> = {}): CandleTrapSetupResult => ({
    signal: 'NEUTRAL',
    setupName: 'The Candle Trap',
    grade: null,
    confidence: 45,
    entryPrice: null,
    takeProfit: null,
    stopLoss: null,
    indicators,
    reason,
  });

  if (candles.length < 25) {
    return neutralResult('Minimum 25 candles required for Candle Trap setup logic.');
  }

  const trapIndex = candles.length - 2; // last closed candle
  const signalIndex = candles.length - 1;
  if (trapIndex < 1 || ema21Array.length <= trapIndex || rsi6Array.length <= trapIndex) {
    return neutralResult('Insufficient EMA21/RSI6 history for trap evaluation.');
  }

  const trap = candles[trapIndex];
  const bodySize = Math.abs(trap.close - trap.open);
  const upperWick = trap.high - Math.max(trap.open, trap.close);
  const lowerWick = Math.min(trap.open, trap.close) - trap.low;
  const totalRange = Math.max(trap.high - trap.low, 1e-9);
  const isDoji = bodySize / totalRange <= 0.1;

  const rangeWindow = candles.slice(-21, -1);
  const avgRange20 = rangeWindow.length > 0
    ? rangeWindow.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / rangeWindow.length
    : totalRange;

  const trapMetrics: Record<string, number | string | boolean | null> = {
    trapIndex,
    bodySize,
    upperWick,
    lowerWick,
    totalRange,
    isDoji,
    avgRange20,
    ema21: Number.isFinite(ema21Array[trapIndex]) ? ema21Array[trapIndex] : null,
    rsi6: Number.isFinite(rsi6Array[trapIndex]) ? rsi6Array[trapIndex] : null,
  };

  if (candles.length < 50) {
    return neutralResult('Warm-up buffer: need at least 50 candles before non-neutral Candle Trap output.', trapMetrics);
  }

  if (!Number.isFinite(ema21Array[trapIndex]) || !Number.isFinite(rsi6Array[trapIndex])) {
    return neutralResult('EMA21/RSI6 contains non-finite values at trap candle.', trapMetrics);
  }

  const bullishTrap =
    lowerWick / Math.max(bodySize, 1e-9) >= 2 &&
    lowerWick / totalRange >= 0.55 &&
    bodySize / totalRange <= 0.35 &&
    totalRange >= avgRange20 * 1.05;

  const bearishTrap =
    upperWick / Math.max(bodySize, 1e-9) >= 2 &&
    upperWick / totalRange >= 0.55 &&
    bodySize / totalRange <= 0.35 &&
    totalRange >= avgRange20 * 1.05;

  if (!bullishTrap && !bearishTrap) {
    return neutralResult('Trap candle does not satisfy required wick/body/range thresholds.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
    });
  }

  const prior4 = candles.slice(Math.max(0, trapIndex - 4), trapIndex);
  const conflictingOppositeTrap = bullishTrap
    ? prior4.some(c => isBearishTrapCandle(c))
    : prior4.some(c => isBullishTrapCandle(c));
  if (conflictingOppositeTrap) {
    return neutralResult('Conflicting opposite trap pattern found within prior 4 candles.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      conflictingOppositeTrap,
    });
  }

  const prior10 = candles.slice(Math.max(0, trapIndex - 10), trapIndex);
  const trapLikeCount = prior10.filter(c => isBullishTrapCandle(c) || isBearishTrapCandle(c)).length;
  if (trapLikeCount >= 3) {
    return neutralResult('Prior 10 candles contain >=3 trap-like candles (signal is noisy).', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      trapLikeCount,
    });
  }

  const rsiAtTrap = rsi6Array[trapIndex];
  if ([25, 40, 60, 75].includes(rsiAtTrap)) {
    return neutralResult('RSI6 is exactly on boundary (25/40/60/75), Candle Trap filtered.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
    });
  }

  const emaSlopeStart = trapIndex - 5;
  if (emaSlopeStart < 0 || !Number.isFinite(ema21Array[emaSlopeStart])) {
    return neutralResult('Not enough EMA21 history to compute 5-bar slope.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
    });
  }

  const emaSlopePct = Math.abs((ema21Array[trapIndex] - ema21Array[emaSlopeStart]) / Math.max(Math.abs(ema21Array[emaSlopeStart]), 1e-9)) * 100;
  if (emaSlopePct < 0.01) {
    return neutralResult('EMA21 5-bar slope is below 0.01%, trend is too flat.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaSlopePct,
    });
  }

  const direction: SignalDirection = bullishTrap ? 'RISE' : 'FALL';

  // Step 1: EMA proximity ±0.15%
  const trapClose = trap.close;
  const ema21Trap = ema21Array[trapIndex];
  const emaDistancePct = ((trapClose - ema21Trap) / Math.max(Math.abs(ema21Trap), 1e-9)) * 100;
  if (Math.abs(emaDistancePct) > 0.15) {
    return neutralResult('Step 1 fail: trap close is not within ±0.15% of EMA21.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaDistancePct,
    });
  }

  // Step 2: RSI zone checks
  const rsiZonePass = direction === 'RISE'
    ? rsiAtTrap > 25 && rsiAtTrap < 40
    : rsiAtTrap > 60 && rsiAtTrap < 75;
  if (!rsiZonePass) {
    return neutralResult(
      `Step 2 fail: RSI6 ${rsiAtTrap.toFixed(2)} outside ${direction === 'RISE' ? '25–40' : '60–75'} zone.`,
      { ...trapMetrics, bullishTrap, bearishTrap, emaDistancePct },
    );
  }

  // Step 3: 5-candle trend counts and strength
  const trendSliceStart = Math.max(1, trapIndex - 5);
  let lowerLows = 0;
  let higherHighs = 0;
  for (let i = trendSliceStart; i <= trapIndex; i++) {
    if (candles[i].low < candles[i - 1].low) lowerLows++;
    if (candles[i].high > candles[i - 1].high) higherHighs++;
  }

  const trendCountPass = direction === 'RISE' ? lowerLows >= 3 : higherHighs >= 3;
  const trendStrength = direction === 'RISE' ? lowerLows / 5 : higherHighs / 5;
  if (!trendCountPass || trendStrength < 0.6) {
    return neutralResult('Step 3 fail: 5-candle trend count/strength requirement not met.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaDistancePct,
      lowerLows,
      higherHighs,
      trendStrength,
    });
  }

  // Step 4: failed breakdown/breakout against prior 20-candle swing
  const prior20 = candles.slice(Math.max(0, trapIndex - 20), trapIndex);
  const swingLow = prior20.length ? Math.min(...prior20.map(c => c.low)) : trap.low;
  const swingHigh = prior20.length ? Math.max(...prior20.map(c => c.high)) : trap.high;

  const failedBreakdown = trap.low < swingLow && trap.close > swingLow;
  const failedBreakout = trap.high > swingHigh && trap.close < swingHigh;
  const swingFailurePass = direction === 'RISE' ? failedBreakdown : failedBreakout;
  if (!swingFailurePass) {
    return neutralResult('Step 4 fail: no failed breakdown/breakout at prior 20-candle swing level.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaDistancePct,
      lowerLows,
      higherHighs,
      trendStrength,
      swingLow,
      swingHigh,
      failedBreakdown,
      failedBreakout,
    });
  }

  // Step 5: confirmation candle closes in signal direction
  const confirmCandle = candles[signalIndex];
  const confirmationPass = direction === 'RISE'
    ? confirmCandle.close > trap.close
    : confirmCandle.close < trap.close;
  if (!confirmationPass) {
    return neutralResult('Step 5 fail: post-trap confirmation candle did not close in setup direction.', {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaDistancePct,
      lowerLows,
      higherHighs,
      trendStrength,
      swingLow,
      swingHigh,
      failedBreakdown,
      failedBreakout,
      confirmationPass,
    });
  }

  const dominantWick = direction === 'RISE' ? lowerWick : upperWick;
  const dominantWickToBody = dominantWick / Math.max(bodySize, 1e-9);
  const bodyToRange = bodySize / totalRange;
  const rangeExpansion = totalRange / Math.max(avgRange20, 1e-9);

  let grade: CandleTrapGrade = 'C';
  let confidence = 65;
  if (dominantWickToBody >= 4 && bodyToRange <= 0.2 && rangeExpansion >= 1.4) {
    grade = 'A+';
    confidence = 95;
  } else if (dominantWickToBody >= 3 && bodyToRange <= 0.25 && rangeExpansion >= 1.25) {
    grade = 'A';
    confidence = 88;
  } else if (dominantWickToBody >= 2.5 && bodyToRange <= 0.3 && rangeExpansion >= 1.1) {
    grade = 'B';
    confidence = 78;
  }

  const entryPrice = candles[signalIndex].close;
  const stopLoss = direction === 'RISE'
    ? trap.low - totalRange * 0.1
    : trap.high + totalRange * 0.1;
  const risk = Math.abs(entryPrice - stopLoss);
  const takeProfit = direction === 'RISE'
    ? entryPrice + risk * 1.8
    : entryPrice - risk * 1.8;

  return {
    signal: direction,
    setupName: 'The Candle Trap',
    grade,
    confidence,
    entryPrice,
    takeProfit,
    stopLoss,
    indicators: {
      ...trapMetrics,
      bullishTrap,
      bearishTrap,
      emaDistancePct,
      lowerLows,
      higherHighs,
      trendStrength,
      swingLow,
      swingHigh,
      failedBreakdown,
      failedBreakout,
      confirmationPass,
      dominantWickToBody,
      bodyToRange,
      rangeExpansion,
      grade,
    },
    reason: `All Candle Trap checks passed (${direction}) with grade ${grade}.`,
  };
}

function calcAtrAt(candles: Candle[], index: number, period = 14): number {
  if (index <= 0) return Math.max((candles[index]?.high ?? 0) - (candles[index]?.low ?? 0), 1e-9);
  const start = Math.max(1, index - period + 1);
  let trSum = 0;
  let count = 0;

  for (let i = start; i <= index; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trSum += tr;
    count++;
  }

  return Math.max(count > 0 ? trSum / count : candles[index].high - candles[index].low, 1e-9);
}

function setup4TriggerDirectionAt(candles: Candle[], ema9: number[], rsi3: number[], index: number): SignalDirection {
  if (index < 1 || ema9.length <= index || rsi3.length <= index) return 'NEUTRAL';

  const prevCandle = candles[index - 1];
  const currCandle = candles[index];
  const rsiBullCross50 = rsi3[index - 1] < 50 && rsi3[index] >= 50;
  const rsiBearCross50 = rsi3[index - 1] > 50 && rsi3[index] <= 50;

  const prevRed = prevCandle.close < prevCandle.open;
  const prevGreen = prevCandle.close > prevCandle.open;
  const currGreen = currCandle.close > currCandle.open;
  const currRed = currCandle.close < currCandle.open;

  if (currCandle.close > ema9[index] && rsiBullCross50 && prevRed && currGreen) return 'RISE';
  if (currCandle.close < ema9[index] && rsiBearCross50 && prevGreen && currRed) return 'FALL';
  return 'NEUTRAL';
}

function isFullReversalCandle(signalCandle: Candle, nextCandle: Candle, direction: SignalDirection): boolean {
  if (direction === 'RISE') {
    const nextIsBearish = nextCandle.close < nextCandle.open;
    return nextIsBearish && nextCandle.high >= signalCandle.high && nextCandle.low <= signalCandle.low;
  }

  if (direction === 'FALL') {
    const nextIsBullish = nextCandle.close > nextCandle.open;
    return nextIsBullish && nextCandle.high >= signalCandle.high && nextCandle.low <= signalCandle.low;
  }

  return false;
}

function didHistogramCrossZeroWithinTicks(candles: Candle[], ticks: number, direction: 'up' | 'down'): boolean {
  const start = Math.max(2, candles.length - ticks - 1);

  for (let i = start; i < candles.length; i++) {
    const prevMacd = calcMACDSeries(candles.slice(0, i), 6, 13, 5);
    const currMacd = calcMACDSeries(candles.slice(0, i + 1), 6, 13, 5);
    if (!prevMacd || !currMacd) continue;

    const crossedUp = prevMacd.histogram <= 0 && currMacd.histogram > 0;
    const crossedDown = prevMacd.histogram >= 0 && currMacd.histogram < 0;

    if (direction === 'up' && crossedUp) return true;
    if (direction === 'down' && crossedDown) return true;
  }

  return false;
}

function getStochasticCrossMeta(candles: Candle[], maxBarsSinceCross: number): {
  barsSinceBullCross: number | null;
  barsSinceBearCross: number | null;
  bullCrossK: number | null;
  bearCrossK: number | null;
} {
  let barsSinceBullCross: number | null = null;
  let barsSinceBearCross: number | null = null;
  let bullCrossK: number | null = null;
  let bearCrossK: number | null = null;

  for (let barsAgo = 0; barsAgo <= maxBarsSinceCross; barsAgo++) {
    const candleIndex = candles.length - 1 - barsAgo;
    if (candleIndex < 1) break;

    const stochAtCandle = calcStochastic(candles.slice(0, candleIndex + 1), 5, 3, 3);
    if (!stochAtCandle) continue;

    const bullCross = stochAtCandle.previousK <= stochAtCandle.previousD && stochAtCandle.k > stochAtCandle.d;
    const bearCross = stochAtCandle.previousK >= stochAtCandle.previousD && stochAtCandle.k < stochAtCandle.d;

    if (barsSinceBullCross === null && bullCross) {
      barsSinceBullCross = barsAgo;
      bullCrossK = stochAtCandle.k;
    }

    if (barsSinceBearCross === null && bearCross) {
      barsSinceBearCross = barsAgo;
      bearCrossK = stochAtCandle.k;
    }

    if (barsSinceBullCross !== null && barsSinceBearCross !== null) break;
  }

  return { barsSinceBullCross, barsSinceBearCross, bullCrossK, bearCrossK };
}

export function generateSignal(candles: Candle[]): SignalResult {
  const indicators: IndicatorSignal[] = [];
  const last = candles.length - 1;
  const prev = Math.max(0, last - 1);
  const close = candles[last]?.close ?? 0;

  const ichimoku = calcIchimoku(candles);

  const ema5 = calcEMAValues(candles, 5);
  const ema9 = calcEMAValues(candles, 9);
  const ema13 = calcEMAValues(candles, 13);
  const ema21 = calcEMAValues(candles, 21);
  const ema50 = calcEMAValues(candles, 50);

  const rsi3 = calcRSISeries(candles, 3);
  const rsi6 = calcRSISeries(candles, 6);
  const rsi7Series = calcRSISeries(candles, 7);

  const stochastic = calcStochastic(candles, 5, 3, 3);
  const macdTrend = calcMACDSeries(candles, 6, 13, 5);
  const supportResistance = calcSwingSupportResistance(candles, 100, 0.05, 2);

  // 1) Ichimoku unchanged logic
  if (ichimoku) {
    let direction: SignalDirection = 'NEUTRAL';
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
      weight: 1,
      values: {
        tenkan: ichimoku.tenkanSen.toFixed(2),
        kijun: ichimoku.kijunSen.toFixed(2),
      },
    });
  }

  // 2) Setup 1 — Reversal Mode
  const currentRsi7 = rsi7Series[last];
  const previousRsi7 = rsi7Series[prev];
  const currentEma21 = ema21[last];
  if (Number.isFinite(currentRsi7) && Number.isFinite(currentEma21) && candles.length > 1) {
    const currentCandle = candles[last];
    const previousCandle = candles[prev];
    const nearSupport = isNearLevel(close, supportResistance.nearestSupport, 0.1);
    const nearResistance = isNearLevel(close, supportResistance.nearestResistance, 0.1);

    const bullishCandleConfirmation =
      currentCandle.close > previousCandle.high ||
      hasStrongBullishBody(currentCandle);
    const bearishCandleConfirmation =
      currentCandle.close < previousCandle.low ||
      hasStrongBearishBody(currentCandle);

    let reversalDirection: SignalDirection = 'NEUTRAL';
    if (nearSupport && currentRsi7 < 25 && bullishCandleConfirmation) reversalDirection = 'RISE';
    if (nearResistance && currentRsi7 > 75 && bearishCandleConfirmation) reversalDirection = 'FALL';

    indicators.push({
      name: 'Setup 1: Reversal Mode',
      direction: reversalDirection,
      confidence: reversalDirection === 'NEUTRAL' ? 45 : 74,
      detail: `RSI7 ${currentRsi7.toFixed(1)} · ${bullishCandleConfirmation ? 'Bull conf ✓' : 'Bull conf ✗'} · ${bearishCandleConfirmation ? 'Bear conf ✓' : 'Bear conf ✗'} · S ${supportResistance.nearestSupport?.toFixed(2) ?? '—'} · R ${supportResistance.nearestResistance?.toFixed(2) ?? '—'}`,
      weight: 1,
    });

    // 3) Setup 1 — Trend-Continuation Mode
    const rsiRecoveredAbove30 = Number.isFinite(previousRsi7) && previousRsi7 <= 30 && currentRsi7 > 30;
    const rsiDroppedBelow70 = Number.isFinite(previousRsi7) && previousRsi7 >= 70 && currentRsi7 < 70;

    let continuationDirection: SignalDirection = 'NEUTRAL';
    if (close > currentEma21 && nearSupport && rsiRecoveredAbove30) continuationDirection = 'RISE';
    if (close < currentEma21 && nearResistance && rsiDroppedBelow70) continuationDirection = 'FALL';

    indicators.push({
      name: 'Setup 1: Trend-Continuation Mode',
      direction: continuationDirection,
      confidence: continuationDirection === 'NEUTRAL' ? 45 : 72,
      detail: `RSI7 ${currentRsi7.toFixed(1)} (${rsiRecoveredAbove30 ? '↑30' : rsiDroppedBelow70 ? '↓70' : '—'}) · EMA21 ${currentEma21.toFixed(2)} · S ${supportResistance.nearestSupport?.toFixed(2) ?? '—'} · R ${supportResistance.nearestResistance?.toFixed(2) ?? '—'}`,
      weight: 1,
    });
  }

  // 4) EMA Crossover & Stochastic
  if (ema5.length > prev && ema13.length > prev && stochastic) {
    const MAX_BARS_SINCE_STOCH_CROSS = 1;
    const emaBullCross = ema5[prev] <= ema13[prev] && ema5[last] > ema13[last];
    const emaBearCross = ema5[prev] >= ema13[prev] && ema5[last] < ema13[last];
    const {
      barsSinceBullCross,
      barsSinceBearCross,
      bullCrossK,
      bearCrossK,
    } = getStochasticCrossMeta(candles, MAX_BARS_SINCE_STOCH_CROSS);

    const stochBullCrossRecent = barsSinceBullCross !== null && barsSinceBullCross <= MAX_BARS_SINCE_STOCH_CROSS;
    const stochBearCrossRecent = barsSinceBearCross !== null && barsSinceBearCross <= MAX_BARS_SINCE_STOCH_CROSS;

    const kRisingFromBelow20 = stochastic.previousK < 20 && stochastic.k > stochastic.previousK;
    const kFallingFromAbove80 = stochastic.previousK > 80 && stochastic.k < stochastic.previousK;
    const kValidForRise = (bullCrossK !== null && bullCrossK < 25) || kRisingFromBelow20;
    const kValidForFall = (bearCrossK !== null && bearCrossK > 75) || kFallingFromAbove80;

    let direction: SignalDirection = 'NEUTRAL';
    if (emaBullCross && stochBullCrossRecent && kValidForRise) direction = 'RISE';
    if (emaBearCross && stochBearCrossRecent && kValidForFall) direction = 'FALL';

    indicators.push({
      name: 'EMA Crossover & Stochastic',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 74,
      detail:
        `EMA5 ${ema5[last].toFixed(2)} / EMA13 ${ema13[last].toFixed(2)} · ` +
        `K ${stochastic.k.toFixed(1)} D ${stochastic.d.toFixed(1)} · ` +
        `bars since K/D cross ↑ ${barsSinceBullCross ?? '—'} ↓ ${barsSinceBearCross ?? '—'} (max ${MAX_BARS_SINCE_STOCH_CROSS})`,
      weight: 1,
    });
  }

  // 5) Trend Filter
  if (macdTrend && ema50.length > prev && ema21.length > prev) {
    const MACD_ZERO_CROSS_LOOKBACK_TICKS = 18;
    const MIN_EMA50_DISTANCE = 0.04;
    const EMA50_FLAT_SLOPE_THRESHOLD = 0.01;

    const macdBullCross = macdTrend.previousMacd <= macdTrend.previousSignal && macdTrend.macd > macdTrend.signal;
    const macdBearCross = macdTrend.previousMacd >= macdTrend.previousSignal && macdTrend.macd < macdTrend.signal;
    const histogramIncreasing = macdTrend.histogram > macdTrend.previousHistogram;
    const histogramDecreasing = macdTrend.histogram < macdTrend.previousHistogram;
    const histogramNonNegative = macdTrend.histogram >= 0;
    const histogramNonPositive = macdTrend.histogram <= 0;
    const histogramCrossedUpRecently = didHistogramCrossZeroWithinTicks(candles, MACD_ZERO_CROSS_LOOKBACK_TICKS, 'up');
    const histogramCrossedDownRecently = didHistogramCrossZeroWithinTicks(candles, MACD_ZERO_CROSS_LOOKBACK_TICKS, 'down');

    const ema50Distance = close - ema50[last];
    const ema50Slope = ema50[last] - ema50[prev];
    const ema50IsFlat = Math.abs(ema50Slope) < EMA50_FLAT_SLOPE_THRESHOLD;

    const riseCond =
      !ema50IsFlat &&
      close > ema50[last] &&
      ema50Distance >= MIN_EMA50_DISTANCE &&
      macdBullCross &&
      histogramIncreasing &&
      (histogramNonNegative || histogramCrossedUpRecently);

    const fallCond =
      !ema50IsFlat &&
      close < ema50[last] &&
      ema50Distance <= -MIN_EMA50_DISTANCE &&
      macdBearCross &&
      histogramDecreasing &&
      (histogramNonPositive || histogramCrossedDownRecently);

    let direction: SignalDirection = 'NEUTRAL';
    if (riseCond) direction = 'RISE';
    if (fallCond) direction = 'FALL';

    const ema50Rising = ema50[last] > ema50[prev];
    const ema21Rising = ema21[last] > ema21[prev];
    const trendAgreeUp = ema50Rising && ema21Rising;
    const trendAgreeDown = !ema50Rising && !ema21Rising;

    const pullbackToSR = isNearLevel(close, supportResistance.nearestSupport, 0.1) || isNearLevel(close, supportResistance.nearestResistance, 0.1);

    const oscillatorConfirmsRise = (Number.isFinite(currentRsi7) && currentRsi7 < 30) || (stochastic ? stochastic.k < 20 && stochastic.k > stochastic.d : false);
    const oscillatorConfirmsFall = (Number.isFinite(currentRsi7) && currentRsi7 > 70) || (stochastic ? stochastic.k > 80 && stochastic.k < stochastic.d : false);

    const isStrongSignal =
      (direction === 'RISE' && trendAgreeUp && pullbackToSR && oscillatorConfirmsRise) ||
      (direction === 'FALL' && trendAgreeDown && pullbackToSR && oscillatorConfirmsFall);

    indicators.push({
      name: 'Trend Filter',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : isStrongSignal ? 85 : 75,
      detail:
        `EMA50 ${ema50[last].toFixed(2)} · Δ${ema50Distance.toFixed(4)} · slope ${ema50Slope.toFixed(4)} · ` +
        `MACD Hist ${macdTrend.histogram.toFixed(4)} (${macdTrend.previousHistogram.toFixed(4)}→${macdTrend.histogram.toFixed(4)})` +
        `${ema50IsFlat ? ' · FLAT EMA50 SKIP' : ''}${isStrongSignal ? ' · STRONG' : ''}`,
      weight: 1,
      isStrongSignal,
    });
  }

  // 5) Setup 4 — Scalp Machine
  if (ema9.length > prev && rsi3.length > prev) {
    const prevCandle = candles[prev];
    const currCandle = candles[last];
    const ema9Slope = ema9[last] - ema9[prev];
    const EMA9_SLOPE_THRESHOLD = 0.01;
    const slopeSupportsRise = ema9Slope > EMA9_SLOPE_THRESHOLD;
    const slopeSupportsFall = ema9Slope < -EMA9_SLOPE_THRESHOLD;

    const atr14 = calcAtrAt(candles, last, 14);
    const currBody = getBodySize(currCandle);
    const minBodyThreshold = atr14 * 0.35;
    const bodyIsLargeEnough = currBody >= minBodyThreshold;

    const recentBodies = candles.slice(Math.max(0, last - 2), last + 1).map(getBodySize);
    const longBodyCount = recentBodies.filter(body => body >= minBodyThreshold).length;
    const inHighLiquiditySession = longBodyCount >= 2;

    const priorSameDirectionSignalWithinCooldown = (direction: SignalDirection): boolean => {
      const start = Math.max(1, last - 5);
      for (let i = start; i < last; i++) {
        if (setup4TriggerDirectionAt(candles, ema9, rsi3, i) === direction) return true;
      }
      return false;
    };

    const previousSignalDirection = setup4TriggerDirectionAt(candles, ema9, rsi3, prev);
    const hardInvalidation = previousSignalDirection !== 'NEUTRAL' &&
      isFullReversalCandle(prevCandle, currCandle, previousSignalDirection);

    const baseRisePrefilters = inHighLiquiditySession && slopeSupportsRise && bodyIsLargeEnough && !hardInvalidation;
    const baseFallPrefilters = inHighLiquiditySession && slopeSupportsFall && bodyIsLargeEnough && !hardInvalidation;

    const riseCooldownClear = !priorSameDirectionSignalWithinCooldown('RISE');
    const fallCooldownClear = !priorSameDirectionSignalWithinCooldown('FALL');

    const risePrefiltersOk = baseRisePrefilters && riseCooldownClear;
    const fallPrefiltersOk = baseFallPrefilters && fallCooldownClear;

    // Trigger checks run only after all mandatory pre-Signal filters pass.
    const rsiBullCross50 = rsi3[prev] < 50 && rsi3[last] >= 50;
    const rsiBearCross50 = rsi3[prev] > 50 && rsi3[last] <= 50;

    const prevRed = prevCandle.close < prevCandle.open;
    const prevGreen = prevCandle.close > prevCandle.open;
    const currGreen = currCandle.close > currCandle.open;
    const currRed = currCandle.close < currCandle.open;

    let direction: SignalDirection = 'NEUTRAL';
    if (risePrefiltersOk && currCandle.close > ema9[last] && rsiBullCross50 && prevRed && currGreen) direction = 'RISE';
    if (fallPrefiltersOk && currCandle.close < ema9[last] && rsiBearCross50 && prevGreen && currRed) direction = 'FALL';

    indicators.push({
      name: 'Setup 4: Scalp Machine',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 76,
      detail:
        `Pre-filters: liquidity ${inHighLiquiditySession ? '✓' : '✗'} (long bodies ${longBodyCount}/3) · ` +
        `EMA9 slope ${ema9Slope.toFixed(4)} ${slopeSupportsRise || slopeSupportsFall ? '✓' : 'flat ✗'} · ` +
        `min body ${currBody.toFixed(4)}≥${minBodyThreshold.toFixed(4)} ${bodyIsLargeEnough ? '✓' : '✗'} · ` +
        `cooldown R:${riseCooldownClear ? '✓' : '✗'} F:${fallCooldownClear ? '✓' : '✗'} · ` +
        `hard invalidation ${hardInvalidation ? 'TRIGGERED' : 'clear'} · ` +
        `Trigger: RSI3 ${rsi3[last].toFixed(1)} (${rsiBullCross50 ? '↑50' : rsiBearCross50 ? '↓50' : '—'}) · ` +
        `Color ${prevRed && currGreen ? 'red→green' : prevGreen && currRed ? 'green→red' : 'none'}`,
      weight: 1,
    });
  }

  // 6) The Candle Trap
  void detectCandleTrap;
  if (ema21.length > last && rsi6.length > last && candles.length >= 2) {
    const trapIndex = last - 1;
    const trapCandle = candles[trapIndex];
    const trapClose = trapCandle.close;
    const trapOpen = trapCandle.open;
    const trapHigh = trapCandle.high;
    const trapLow = trapCandle.low;

    const bodySize = Math.abs(trapClose - trapOpen);
    const upperWick = trapHigh - Math.max(trapClose, trapOpen);
    const lowerWick = Math.min(trapClose, trapOpen) - trapLow;
    const totalRange = Math.max(trapHigh - trapLow, 1e-9);

    const prior20ForAverage = candles.slice(Math.max(0, trapIndex - 20), trapIndex);
    const avgCandleRange = prior20ForAverage.length
      ? prior20ForAverage.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / prior20ForAverage.length
      : totalRange;

    let direction: SignalDirection = 'NEUTRAL';
    let confidence = 45;
    let grade: CandleTrapGrade = null;
    let reason = 'Rejected: Candle Trap not evaluated.';

    let lowerLowCount: number | null = null;
    let higherHighCount: number | null = null;
    let lowestLowLast20: number | null = null;
    let highestHighLast20: number | null = null;

    if (candles.length < 25) {
      reason = 'Rejected: requires at least 25 candles.';
    } else if (bodySize <= totalRange * 0.05) {
      reason = 'Rejected: trap candle is doji-like (body <= 5% of range).';
    } else if (totalRange < avgCandleRange * 0.8) {
      reason = 'Rejected: trap candle range is too small vs recent average.';
    } else {
      const isBullishTrap =
        lowerWick >= 2 * bodySize &&
        upperWick < bodySize &&
        bodySize > totalRange * 0.08 &&
        lowerWick >= totalRange * 0.55;

      const isBearishTrap =
        upperWick >= 2 * bodySize &&
        lowerWick < bodySize &&
        bodySize > totalRange * 0.08 &&
        upperWick >= totalRange * 0.55;

      if (!isBullishTrap && !isBearishTrap) {
        reason = 'Rejected: candle does not match bullish or bearish trap geometry.';
      } else {
        const prior4 = candles.slice(Math.max(0, trapIndex - 4), trapIndex);
        const hasOppositeTrapInPrior4 = isBullishTrap
          ? prior4.some(c => isBearishTrapCandle(c))
          : prior4.some(c => isBullishTrapCandle(c));

        const prior10 = candles.slice(Math.max(0, trapIndex - 10), trapIndex);
        const trapShapeCountInPrior10 = prior10.filter(c => isBullishTrapCandle(c) || isBearishTrapCandle(c)).length;

        const trapRsi6 = rsi6[trapIndex];
        const rsiAtBoundary = [25, 40, 60, 75].some(v => Math.abs(trapRsi6 - v) < 1e-9);

        const emaSlopeStart = trapIndex - 5;
        const emaSlopePct = emaSlopeStart >= 0
          ? Math.abs((ema21[trapIndex] - ema21[emaSlopeStart]) / Math.max(Math.abs(ema21[emaSlopeStart]), 1e-9)) * 100
          : Number.POSITIVE_INFINITY;

        if (hasOppositeTrapInPrior4) {
          reason = 'Rejected: opposite trap exists in previous 4 candles.';
        } else if (trapShapeCountInPrior10 >= 3) {
          reason = 'Rejected: 3+ trap-shaped candles in previous 10 candles.';
        } else if (rsiAtBoundary) {
          reason = 'Rejected: RSI6 is exactly on boundary (25/40/60/75).';
        } else if (emaSlopePct < 0.01) {
          reason = 'Rejected: EMA21 slope over last 5 candles is flat (<0.01%).';
        } else {
          const dominantWick = isBullishTrap ? lowerWick : upperWick;
          const oppositeWick = isBullishTrap ? upperWick : lowerWick;
          const wickRatio = dominantWick / Math.max(bodySize, 1e-9);
          const wickPct = dominantWick / totalRange;

          if (wickRatio >= 3 && oppositeWick === 0 && wickPct >= 0.65) {
            grade = 'A+';
            confidence = 95;
          } else if (wickRatio >= 2.5 && oppositeWick < bodySize * 0.5 && wickPct >= 0.6) {
            grade = 'A';
            confidence = 88;
          } else if (wickRatio >= 2 && oppositeWick < bodySize && wickPct >= 0.55) {
            grade = 'B';
            confidence = 78;
          } else {
            grade = 'C';
            confidence = 65;
          }

          let localLowerLowCount = 0;
          let localHigherHighCount = 0;
          const trendStart = Math.max(1, trapIndex - 5);
          for (let i = trendStart; i < trapIndex; i++) {
            if (candles[i].low < candles[i - 1].low) localLowerLowCount++;
            if (candles[i].high > candles[i - 1].high) localHigherHighCount++;
          }

          const prior20ForSwing = candles.slice(Math.max(0, trapIndex - 20), trapIndex);
          const localLowestLowLast20 = prior20ForSwing.length ? Math.min(...prior20ForSwing.map(c => c.low)) : trapLow;
          const localHighestHighLast20 = prior20ForSwing.length ? Math.max(...prior20ForSwing.map(c => c.high)) : trapHigh;

          lowerLowCount = localLowerLowCount;
          higherHighCount = localHigherHighCount;
          lowestLowLast20 = localLowestLowLast20;
          highestHighLast20 = localHighestHighLast20;

          const riseSignal =
            isBullishTrap &&
            trapClose <= ema21[trapIndex] * 1.0015 &&
            trapRsi6 >= 25 && trapRsi6 <= 40 &&
            localLowerLowCount >= 3 &&
            trapLow >= localLowestLowLast20;

          const fallSignal =
            isBearishTrap &&
            trapClose >= ema21[trapIndex] * 0.9985 &&
            trapRsi6 >= 60 && trapRsi6 <= 75 &&
            localHigherHighCount >= 3 &&
            trapHigh <= localHighestHighLast20;

          if (riseSignal) {
            direction = 'RISE';
            reason = 'RISE: bullish trap passed all 5-step validation checks.';
          } else if (fallSignal) {
            direction = 'FALL';
            reason = 'FALL: bearish trap passed all 5-step validation checks.';
          } else {
            reason = 'Rejected: trap shape valid but failed RISE/FALL 5-step validation.';
          }
        }
      }
    }

    indicators.push({
      name: 'The Candle Trap',
      direction,
      confidence,
      detail: `${reason} · Grade ${grade ?? '—'} · EMA21 ${ema21[trapIndex].toFixed(2)} · RSI6 ${rsi6[trapIndex].toFixed(1)}`,
      weight: 1,
      values: {
        trapIndex,
        bodySize,
        upperWick,
        lowerWick,
        totalRange,
        avgCandleRange,
        grade,
        lowerLowCount,
        higherHighCount,
        lowestLowLast20,
        highestHighLast20,
      },
    });
  }


  const riseCount = indicators.filter(i => i.direction === 'RISE').length;
  const fallCount = indicators.filter(i => i.direction === 'FALL').length;
  const neutralCount = indicators.filter(i => i.direction === 'NEUTRAL').length;

  let combinedLabel: SignalResult['combinedLabel'] = 'NEUTRAL';
  if (riseCount >= 5) combinedLabel = 'STRONG RISE';
  else if (riseCount === 4) combinedLabel = 'RISE';
  else if (riseCount === 3 && fallCount <= 1) combinedLabel = 'WEAK RISE';
  else if (fallCount >= 5) combinedLabel = 'STRONG FALL';
  else if (fallCount === 4) combinedLabel = 'FALL';
  else if (fallCount === 3 && riseCount <= 1) combinedLabel = 'WEAK FALL';

  const direction: SignalDirection =
    combinedLabel.includes('RISE') ? 'RISE' : combinedLabel.includes('FALL') ? 'FALL' : 'NEUTRAL';

  const strength: SignalStrength =
    combinedLabel.startsWith('STRONG') ? 'STRONG' :
    combinedLabel.startsWith('WEAK') ? 'WEAK' :
    combinedLabel === 'RISE' || combinedLabel === 'FALL' ? 'MODERATE' : 'NONE';

  const agreeCount = Math.max(riseCount, fallCount);
  const confidence = Math.round((agreeCount / Math.max(indicators.length, 1)) * 100);

  return {
    direction,
    strength,
    confidence,
    confidenceScore: `${agreeCount}/${indicators.length}`,
    combinedLabel,
    indicators,
    riseCount,
    fallCount,
    neutralCount,
    timestamp: Date.now(),
    ichimoku,
    supportResistance,
    stochastic,
    macdTrend,
    ema21: Number.isFinite(ema21[last]) ? ema21[last] : null,
    ema50: Number.isFinite(ema50[last]) ? ema50[last] : null,
    rsi7: Number.isFinite(currentRsi7) ? currentRsi7 : null,
    reason: `${riseCount} rise / ${fallCount} fall / ${neutralCount} neutral`,
  };
}
