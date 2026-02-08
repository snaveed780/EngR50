import type { Candle } from './indicators';
import {
  calcIchimoku,
  calcBollinger,
  calcRSI,
  calcStochRSI,
  calcATR,
  calcMACD,
  calcMA,
  calcADX,
  type IchimokuResult,
  type BollingerResult,
  type RSIResult,
  type StochRSIResult,
  type ATRResult,
  type MACDResult,
  type MAResult,
  type ADXResult,
} from './indicators';

// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalDirection = 'RISE' | 'FALL' | 'WAIT' | 'SIDEWAYS';
export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

export interface IndicatorSignal {
  name: string;
  direction: 'RISE' | 'FALL' | 'NEUTRAL';
  confidence: number; // 0-100
  detail: string;
  weight: number; // importance weight
}

export interface SignalResult {
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number; // overall confidence 0-100
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
  reason: string;
}

// ─── Signal Engine ───────────────────────────────────────────────────────────

export function generateSignal(candles: Candle[]): SignalResult {
  const indicators: IndicatorSignal[] = [];

  // Calculate all indicators
  const ichimoku = calcIchimoku(candles);
  const bollinger = calcBollinger(candles);
  const rsi = calcRSI(candles);
  const stochRSI = calcStochRSI(candles);
  const atr = calcATR(candles);
  const macd = calcMACD(candles);
  const ma = calcMA(candles);
  const adx = calcADX(candles);

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
  }

  // ─── 2. BOLLINGER BANDS ─────────────────────────────────────────────────

  if (bollinger) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (bollinger.percentB < 0.05) {
      direction = 'RISE';
      confidence = 70;
      details.push('At lower band (bounce)');
    } else if (bollinger.percentB > 0.95) {
      direction = 'FALL';
      confidence = 70;
      details.push('At upper band (pullback)');
    } else if (bollinger.percentB < 0.2) {
      direction = 'RISE';
      confidence = 55;
      details.push('Near lower band');
    } else if (bollinger.percentB > 0.8) {
      direction = 'FALL';
      confidence = 55;
      details.push('Near upper band');
    } else {
      details.push('Mid range');
      confidence = 30;
    }

    details.push(`%B: ${(bollinger.percentB * 100).toFixed(1)}%`);

    indicators.push({
      name: 'Bollinger Bands',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 1.0,
    });
  }

  // ─── 3. STOCHASTIC RSI ─────────────────────────────────────────────────

  if (stochRSI) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (stochRSI.oversold && stochRSI.k > stochRSI.d) {
      direction = 'RISE';
      confidence = 75;
      details.push('Oversold + K > D');
    } else if (stochRSI.overbought && stochRSI.k < stochRSI.d) {
      direction = 'FALL';
      confidence = 75;
      details.push('Overbought + K < D');
    } else if (stochRSI.oversold) {
      direction = 'RISE';
      confidence = 60;
      details.push('Oversold zone');
    } else if (stochRSI.overbought) {
      direction = 'FALL';
      confidence = 60;
      details.push('Overbought zone');
    } else if (stochRSI.k > stochRSI.d && stochRSI.k < 50) {
      direction = 'RISE';
      confidence = 50;
      details.push('K > D below midline');
    } else if (stochRSI.k < stochRSI.d && stochRSI.k > 50) {
      direction = 'FALL';
      confidence = 50;
      details.push('K < D above midline');
    } else {
      details.push('Neutral zone');
    }

    details.push(`K: ${stochRSI.k.toFixed(1)} D: ${stochRSI.d.toFixed(1)}`);

    indicators.push({
      name: 'Stochastic RSI',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 1.0,
    });
  }

  // ─── 4. RSI ─────────────────────────────────────────────────────────────

  if (rsi) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (rsi.value < 25) {
      direction = 'RISE';
      confidence = 75;
      details.push('Strongly oversold');
    } else if (rsi.value > 75) {
      direction = 'FALL';
      confidence = 75;
      details.push('Strongly overbought');
    } else if (rsi.oversold) {
      direction = 'RISE';
      confidence = 60;
      details.push('Oversold');
    } else if (rsi.overbought) {
      direction = 'FALL';
      confidence = 60;
      details.push('Overbought');
    } else if (rsi.value < 45) {
      direction = 'RISE';
      confidence = 45;
      details.push('Below midline');
    } else if (rsi.value > 55) {
      direction = 'FALL';
      confidence = 45;
      details.push('Above midline');
    } else {
      details.push('Neutral');
    }

    details.push(`RSI: ${rsi.value.toFixed(1)}`);

    indicators.push({
      name: 'RSI (14)',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 1.0,
    });
  }

  // ─── 5. MACD ────────────────────────────────────────────────────────────

  if (macd) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (macd.crossoverBullish) {
      direction = 'RISE';
      confidence = 80;
      details.push('Bullish crossover!');
    } else if (macd.crossoverBearish) {
      direction = 'FALL';
      confidence = 80;
      details.push('Bearish crossover!');
    } else if (macd.bullish && macd.histogram > 0) {
      direction = 'RISE';
      confidence = 60;
      details.push('Bullish momentum');
    } else if (macd.bearish && macd.histogram < 0) {
      direction = 'FALL';
      confidence = 60;
      details.push('Bearish momentum');
    } else {
      details.push('Neutral');
    }

    details.push(`Hist: ${macd.histogram.toFixed(4)}`);

    indicators.push({
      name: 'MACD',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 1.2,
    });
  }

  // ─── 6. MOVING AVERAGES (EMA 20/50) ────────────────────────────────────

  if (ma) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (ma.goldenCross) {
      direction = 'RISE';
      confidence = 80;
      details.push('Golden Cross!');
    } else if (ma.deathCross) {
      direction = 'FALL';
      confidence = 80;
      details.push('Death Cross!');
    } else if (ma.priceAboveEma20 && ma.priceAboveEma50 && ma.ema20AboveEma50) {
      direction = 'RISE';
      confidence = 70;
      details.push('Full bullish alignment');
    } else if (!ma.priceAboveEma20 && !ma.priceAboveEma50 && !ma.ema20AboveEma50) {
      direction = 'FALL';
      confidence = 70;
      details.push('Full bearish alignment');
    } else if (ma.priceAboveEma20 && ma.ema20AboveEma50) {
      direction = 'RISE';
      confidence = 55;
      details.push('Above EMAs, bullish');
    } else if (!ma.priceAboveEma20 && !ma.ema20AboveEma50) {
      direction = 'FALL';
      confidence = 55;
      details.push('Below EMAs, bearish');
    } else {
      details.push('Mixed signals');
    }

    indicators.push({
      name: 'EMA 20/50',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 1.0,
    });
  }

  // ─── 7. ADX (Trend Strength) ───────────────────────────────────────────

  if (adx) {
    let direction: 'RISE' | 'FALL' | 'NEUTRAL' = 'NEUTRAL';
    let confidence = 40;
    const details: string[] = [];

    if (adx.strongTrend) {
      if (adx.bullishDI) {
        direction = 'RISE';
        confidence = 65;
        details.push('Strong bullish trend');
      } else {
        direction = 'FALL';
        confidence = 65;
        details.push('Strong bearish trend');
      }
      if (adx.adx > 40) {
        confidence += 10;
        details.push('Very strong');
      }
    } else {
      details.push('Weak/No trend');
      confidence = 25;
    }

    details.push(`ADX: ${adx.adx.toFixed(1)}`);

    indicators.push({
      name: 'ADX',
      direction,
      confidence: Math.min(confidence, 90),
      detail: details.join(' · '),
      weight: 0.8,
    });
  }

  // ─── 8. ATR — Non-directional, modulates confidence ───────────────────

  if (atr) {
    const details: string[] = [];
    if (atr.highVolatility) {
      details.push('High volatility — signals stronger');
    } else {
      details.push('Normal volatility');
    }
    details.push(`ATR: ${atr.value.toFixed(4)}`);

    indicators.push({
      name: 'ATR (14)',
      direction: 'NEUTRAL',
      confidence: 50,
      detail: details.join(' · '),
      weight: 0.5,
    });
  }

  // ─── DECISION ENGINE ───────────────────────────────────────────────────

  const directionalIndicators = indicators.filter(i => i.name !== 'ATR (14)');
  const riseSignals = directionalIndicators.filter(i => i.direction === 'RISE');
  const fallSignals = directionalIndicators.filter(i => i.direction === 'FALL');
  const neutralSignals = directionalIndicators.filter(i => i.direction === 'NEUTRAL');

  const riseCount = riseSignals.length;
  const fallCount = fallSignals.length;
  const neutralCount = neutralSignals.length;
  const totalDirectional = directionalIndicators.length;

  // Weighted confidence calculation
  const riseWeightedConf = riseSignals.reduce((sum, s) => sum + s.confidence * s.weight, 0);
  const fallWeightedConf = fallSignals.reduce((sum, s) => sum + s.confidence * s.weight, 0);
  const riseWeightSum = riseSignals.reduce((sum, s) => sum + s.weight, 0);
  const fallWeightSum = fallSignals.reduce((sum, s) => sum + s.weight, 0);

  const riseAvgConf = riseWeightSum > 0 ? riseWeightedConf / riseWeightSum : 0;
  const fallAvgConf = fallWeightSum > 0 ? fallWeightedConf / fallWeightSum : 0;

  // Ichimoku gets extra consideration
  const ichimokuSignal = indicators.find(i => i.name === 'Ichimoku Cloud');

  // ATR volatility multiplier
  const volatilityMult = atr?.highVolatility ? 1.1 : 1.0;

  let direction: SignalDirection = 'WAIT';
  let strength: SignalStrength = 'NONE';
  let overallConfidence = 0;
  let reason = '';

  const STRONG_COUNT = 5;
  const MODERATE_COUNT = 4;
  const STRONG_CONF = 60;

  if (totalDirectional === 0) {
    direction = 'WAIT';
    strength = 'NONE';
    reason = 'No directional indicators available';
  } else if (riseCount >= STRONG_COUNT && riseAvgConf >= STRONG_CONF) {
    direction = 'RISE';
    overallConfidence = Math.min(riseAvgConf * volatilityMult, 98);
    if (ichimokuSignal?.direction === 'RISE' && riseCount >= 5) {
      strength = 'STRONG';
      reason = `${riseCount} indicators bullish with Ichimoku confirmation`;
    } else if (riseCount >= MODERATE_COUNT) {
      strength = 'MODERATE';
      reason = `${riseCount} indicators bullish`;
    } else {
      strength = 'WEAK';
      reason = `Bullish but insufficient consensus`;
    }
  } else if (fallCount >= STRONG_COUNT && fallAvgConf >= STRONG_CONF) {
    direction = 'FALL';
    overallConfidence = Math.min(fallAvgConf * volatilityMult, 98);
    if (ichimokuSignal?.direction === 'FALL' && fallCount >= 5) {
      strength = 'STRONG';
      reason = `${fallCount} indicators bearish with Ichimoku confirmation`;
    } else if (fallCount >= MODERATE_COUNT) {
      strength = 'MODERATE';
      reason = `${fallCount} indicators bearish`;
    } else {
      strength = 'WEAK';
      reason = `Bearish but insufficient consensus`;
    }
  } else if (riseCount >= MODERATE_COUNT && riseCount > fallCount + 1) {
    direction = 'RISE';
    overallConfidence = Math.min(riseAvgConf * volatilityMult * 0.85, 85);
    strength = ichimokuSignal?.direction === 'RISE' ? 'MODERATE' : 'WEAK';
    reason = `${riseCount} indicators bullish (moderate)`;
  } else if (fallCount >= MODERATE_COUNT && fallCount > riseCount + 1) {
    direction = 'FALL';
    overallConfidence = Math.min(fallAvgConf * volatilityMult * 0.85, 85);
    strength = ichimokuSignal?.direction === 'FALL' ? 'MODERATE' : 'WEAK';
    reason = `${fallCount} indicators bearish (moderate)`;
  } else if (neutralCount >= totalDirectional * 0.5) {
    direction = 'SIDEWAYS';
    strength = 'NONE';
    overallConfidence = 0;
    reason = `${neutralCount}/${totalDirectional} indicators neutral — ranging market`;
  } else {
    direction = 'WAIT';
    strength = 'NONE';
    overallConfidence = 0;
    reason = `No clear consensus (Rise: ${riseCount}, Fall: ${fallCount}, Neutral: ${neutralCount})`;
  }

  // Only show RISE/FALL if strength is STRONG or MODERATE
  if ((direction === 'RISE' || direction === 'FALL') && strength === 'WEAK') {
    reason = `Weak ${direction.toLowerCase()} signal suppressed — ${reason}`;
    direction = 'WAIT';
    strength = 'NONE';
    overallConfidence = 0;
  }

  return {
    direction,
    strength,
    confidence: Math.round(overallConfidence),
    indicators,
    riseCount,
    fallCount,
    neutralCount,
    timestamp: Date.now(),
    ichimoku,
    bollinger,
    rsi,
    stochRSI,
    atr,
    macd,
    ma,
    adx,
    reason,
  };
}
