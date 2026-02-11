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

function countLowerLows(candles: Candle[], sample = 5): number {
  let count = 0;
  const start = Math.max(1, candles.length - sample);
  for (let i = start; i < candles.length; i++) {
    if (candles[i].low < candles[i - 1].low) count++;
  }
  return count;
}

function countHigherHighs(candles: Candle[], sample = 5): number {
  let count = 0;
  const start = Math.max(1, candles.length - sample);
  for (let i = start; i < candles.length; i++) {
    if (candles[i].high > candles[i - 1].high) count++;
  }
  return count;
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

  // 2) RSI + MA + S/R L
  const currentRsi7 = rsi7Series[last];
  const currentEma21 = ema21[last];
  if (Number.isFinite(currentRsi7) && Number.isFinite(currentEma21)) {
    const nearSupport = isNearLevel(close, supportResistance.nearestSupport, 0.1);
    const nearResistance = isNearLevel(close, supportResistance.nearestResistance, 0.1);

    let direction: SignalDirection = 'NEUTRAL';
    if (nearSupport && currentRsi7 < 25 && close > currentEma21) direction = 'RISE';
    if (nearResistance && currentRsi7 > 75 && close < currentEma21) direction = 'FALL';

    indicators.push({
      name: 'RSI + MA + S/R L',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 72,
      detail: `RSI7 ${currentRsi7.toFixed(1)} · EMA21 ${currentEma21.toFixed(2)} · S ${supportResistance.nearestSupport?.toFixed(2) ?? '—'} · R ${supportResistance.nearestResistance?.toFixed(2) ?? '—'}`,
      weight: 1,
    });
  }

  // 3) EMA Crossover & Stochastic
  if (ema5.length > prev && ema13.length > prev && stochastic) {
    const MAX_BARS_SINCE_CROSS = 1;
    const emaBullCross = ema5[prev] <= ema13[prev] && ema5[last] > ema13[last];
    const emaBearCross = ema5[prev] >= ema13[prev] && ema5[last] < ema13[last];

    const stochBullCrossNow = stochastic.previousK <= stochastic.previousD && stochastic.k > stochastic.d;
    const stochBearCrossNow = stochastic.previousK >= stochastic.previousD && stochastic.k < stochastic.d;

    const stochasticPrevBar = candles.length > 1 ? calcStochastic(candles.slice(0, -1), 5, 3, 3) : null;
    const stochBullCrossPrev = Boolean(
      stochasticPrevBar && stochasticPrevBar.previousK <= stochasticPrevBar.previousD && stochasticPrevBar.k > stochasticPrevBar.d
    );
    const stochBearCrossPrev = Boolean(
      stochasticPrevBar && stochasticPrevBar.previousK >= stochasticPrevBar.previousD && stochasticPrevBar.k < stochasticPrevBar.d
    );

    const bullBarsSinceCross = stochBullCrossNow ? 0 : stochBullCrossPrev ? 1 : null;
    const bearBarsSinceCross = stochBearCrossNow ? 0 : stochBearCrossPrev ? 1 : null;

    const bullCrossK = stochBullCrossNow ? stochastic.k : stochBullCrossPrev && stochasticPrevBar ? stochasticPrevBar.k : null;
    const bearCrossK = stochBearCrossNow ? stochastic.k : stochBearCrossPrev && stochasticPrevBar ? stochasticPrevBar.k : null;

    const bullKBelow25AtCross = bullCrossK !== null && bullCrossK < 25;
    const bullKRisingFromBelow20 = bullCrossK !== null && bullCrossK < 20 && stochastic.k > stochastic.previousK;
    const bearKAbove75AtCross = bearCrossK !== null && bearCrossK > 75;
    const bearKFallingFromAbove80 = bearCrossK !== null && bearCrossK > 80 && stochastic.k < stochastic.previousK;

    let direction: SignalDirection = 'NEUTRAL';

    if (
      emaBullCross &&
      bullBarsSinceCross !== null &&
      bullBarsSinceCross <= MAX_BARS_SINCE_CROSS &&
      (bullKBelow25AtCross || bullKRisingFromBelow20)
    ) {
      direction = 'RISE';
    }

    if (
      emaBearCross &&
      bearBarsSinceCross !== null &&
      bearBarsSinceCross <= MAX_BARS_SINCE_CROSS &&
      (bearKAbove75AtCross || bearKFallingFromAbove80)
    ) {
      direction = 'FALL';
    }

    indicators.push({
      name: 'EMA Crossover & Stochastic',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 74,
      detail: `EMA5 ${ema5[last].toFixed(2)} / EMA13 ${ema13[last].toFixed(2)} · K ${stochastic.k.toFixed(1)} D ${stochastic.d.toFixed(1)} · Max bars since cross = ${MAX_BARS_SINCE_CROSS}`,
      weight: 1,
    });
  }

  // 4) Trend Filter
  if (macdTrend && ema50.length > prev && ema21.length > prev) {
    const macdBullCross = macdTrend.previousMacd <= macdTrend.previousSignal && macdTrend.macd > macdTrend.signal;
    const macdBearCross = macdTrend.previousMacd >= macdTrend.previousSignal && macdTrend.macd < macdTrend.signal;
    const histTurnsPositive = macdTrend.previousHistogram <= 0 && macdTrend.histogram > 0;
    const histTurnsNegative = macdTrend.previousHistogram >= 0 && macdTrend.histogram < 0;

    let direction: SignalDirection = 'NEUTRAL';
    if (close > ema50[last] && histTurnsPositive && macdBullCross) direction = 'RISE';
    if (close < ema50[last] && histTurnsNegative && macdBearCross) direction = 'FALL';

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
      detail: `EMA50 ${ema50[last].toFixed(2)} · MACD Hist ${macdTrend.histogram.toFixed(4)}${isStrongSignal ? ' · STRONG' : ''}`,
      weight: 1,
      isStrongSignal,
    });
  }

  // 5) Scalp Machine
  if (ema9.length > prev && rsi3.length > prev) {
    const prevCandle = candles[prev];
    const currCandle = candles[last];
    const rsiBullCross50 = rsi3[prev] < 50 && rsi3[last] >= 50;
    const rsiBearCross50 = rsi3[prev] > 50 && rsi3[last] <= 50;

    const prevRed = prevCandle.close < prevCandle.open;
    const prevGreen = prevCandle.close > prevCandle.open;
    const currGreen = currCandle.close > currCandle.open;
    const currRed = currCandle.close < currCandle.open;

    let direction: SignalDirection = 'NEUTRAL';
    if (currCandle.close > ema9[last] && rsiBullCross50 && prevRed && currGreen) direction = 'RISE';
    if (currCandle.close < ema9[last] && rsiBearCross50 && prevGreen && currRed) direction = 'FALL';

    indicators.push({
      name: 'Scalp Machine',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 76,
      detail: `EMA9 ${ema9[last].toFixed(2)} · RSI3 ${rsi3[last].toFixed(1)}`,
      weight: 1,
    });
  }

  // 6) The Candle Trap
  if (ema21.length > last && rsi6.length > last) {
    const current = candles[last];
    const prevCandles = candles.slice(Math.max(0, last - 5), last);
    const last20 = candles.slice(Math.max(0, last - 20), last);

    const lowerLows = countLowerLows(prevCandles, 5);
    const higherHighs = countHigherHighs(prevCandles, 5);

    const lowestLowLast20 = last20.length ? Math.min(...last20.map(c => c.low)) : current.low;
    const highestHighLast20 = last20.length ? Math.max(...last20.map(c => c.high)) : current.high;

    const bullTrap = isBullishTrapCandle(current);
    const bearTrap = isBearishTrapCandle(current);

    const riseCond =
      bullTrap &&
      current.close <= ema21[last] * 1.001 &&
      rsi6[last] >= 25 && rsi6[last] <= 40 &&
      lowerLows >= 3 &&
      current.low >= lowestLowLast20;

    const fallCond =
      bearTrap &&
      current.close >= ema21[last] * 0.999 &&
      rsi6[last] >= 60 && rsi6[last] <= 75 &&
      higherHighs >= 3 &&
      current.high <= highestHighLast20;

    let direction: SignalDirection = 'NEUTRAL';
    if (riseCond) direction = 'RISE';
    if (fallCond) direction = 'FALL';

    indicators.push({
      name: 'The Candle Trap',
      direction,
      confidence: direction === 'NEUTRAL' ? 45 : 78,
      detail: `EMA21 ${ema21[last].toFixed(2)} · RSI6 ${rsi6[last].toFixed(1)} · Trap ${bullTrap || bearTrap ? 'yes' : 'no'}`,
      weight: 1,
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
