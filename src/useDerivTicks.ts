import { useState, useEffect, useRef, useCallback } from 'react';
import type { Candle } from './indicators';

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
const SYMBOL = 'R_50';
const CANDLE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CANDLES = 200;
const PING_INTERVAL = 25000; // 25s keepalive
const STALE_TIMEOUT = 15000; // 15s no tick = stale
const RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 8000]; // progressive backoff

export interface TickData {
  price: number;
  timestamp: number;
}

export interface DerivTicksState {
  candles: Candle[];
  currentTick: TickData | null;
  isConnected: boolean;
  error: string | null;
  currentCandle: Candle | null;
  tickCount: number;
  lastTickTime: number;
  reconnectCount: number;
}

export function useDerivTicks(): DerivTicksState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentTick, setCurrentTick] = useState<TickData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCandle, setCurrentCandle] = useState<Candle | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [lastTickTime, setLastTickTime] = useState(0);
  const [reconnectCount, setReconnectCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const currentCandleRef = useRef<Candle | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickCountRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const reconnectCountRef = useRef(0);
  const mountedRef = useRef(true);
  const subscriptionIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);

  const getCandleTimestamp = useCallback((ts: number): number => {
    return Math.floor(ts / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
  }, []);

  const processTick = useCallback((price: number, epochMs: number) => {
    if (!mountedRef.current) return;
    
    const candleTs = getCandleTimestamp(epochMs);
    tickCountRef.current++;
    lastTickTimeRef.current = Date.now();
    setTickCount(tickCountRef.current);
    setLastTickTime(lastTickTimeRef.current);

    if (!currentCandleRef.current || currentCandleRef.current.timestamp !== candleTs) {
      // New candle period — push completed candle to history
      if (currentCandleRef.current) {
        candlesRef.current = [...candlesRef.current, currentCandleRef.current].slice(-MAX_CANDLES);
        setCandles([...candlesRef.current]);
      }
      // Start new candle
      currentCandleRef.current = {
        open: price,
        high: price,
        low: price,
        close: price,
        timestamp: candleTs,
      };
    } else {
      // Update current candle
      currentCandleRef.current = {
        ...currentCandleRef.current,
        high: Math.max(currentCandleRef.current.high, price),
        low: Math.min(currentCandleRef.current.low, price),
        close: price,
      };
    }
    setCurrentCandle({ ...currentCandleRef.current });
    setCurrentTick({ price, timestamp: epochMs });
  }, [getCandleTimestamp]);

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
      staleCheckRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const closeWs = useCallback(() => {
    cleanup();
    subscriptionIdRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    connectingRef.current = false;
  }, [cleanup]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    cleanup();
    const idx = Math.min(reconnectCountRef.current, RECONNECT_DELAYS.length - 1);
    const delay = RECONNECT_DELAYS[idx];
    reconnectCountRef.current++;
    setReconnectCount(reconnectCountRef.current);
    setError(`Reconnecting in ${(delay / 1000).toFixed(0)}s... (attempt ${reconnectCountRef.current})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        connectWs();
      }
    }, delay);
  }, [cleanup]); // connectWs added below

  const connectWs = useCallback(() => {
    if (!mountedRef.current || connectingRef.current) return;
    
    // Clean up previous connection
    closeWs();
    connectingRef.current = true;
    setError(null);

    try {
      const ws = new WebSocket(DERIV_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        connectingRef.current = false;
        setIsConnected(true);
        setError(null);
        reconnectCountRef.current = 0;
        setReconnectCount(0);

        // Fetch historical candles
        ws.send(JSON.stringify({
          ticks_history: SYMBOL,
          adjust_start_time: 1,
          count: MAX_CANDLES,
          end: 'latest',
          granularity: 120,
          style: 'candles',
        }));

        // Start keepalive ping
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ ping: 1 }));
            } catch {
              // Will be caught by onerror
            }
          }
        }, PING_INTERVAL);

        // Start stale tick detection
        lastTickTimeRef.current = Date.now();
        staleCheckRef.current = setInterval(() => {
          if (!mountedRef.current) return;
          const now = Date.now();
          const elapsed = now - lastTickTimeRef.current;
          if (elapsed > STALE_TIMEOUT && lastTickTimeRef.current > 0) {
            console.warn('[DerivTicks] Stale connection detected, reconnecting...');
            setError('Stale connection, reconnecting...');
            closeWs();
            scheduleReconnect();
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          // Ignore pong
          if (data.pong) return;

          if (data.error) {
            console.error('[DerivTicks] API Error:', data.error);
            // Don't set fatal error for non-critical issues
            if (data.error.code === 'InvalidAppID' || data.error.code === 'RateLimit') {
              setError(data.error.message || 'API Error');
            }
            return;
          }

          // Handle historical candles response
          if (data.candles) {
            const historicalCandles: Candle[] = data.candles.map((c: { epoch: number; open: string; high: string; low: string; close: string }) => ({
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
              timestamp: c.epoch * 1000,
            }));

            candlesRef.current = historicalCandles.slice(-MAX_CANDLES);
            currentCandleRef.current = null;
            setCandles([...candlesRef.current]);

            // Subscribe to live ticks
            ws.send(JSON.stringify({
              ticks: SYMBOL,
              subscribe: 1,
            }));
          }

          // Handle subscription confirmation
          if (data.subscription) {
            subscriptionIdRef.current = data.subscription.id;
          }

          // Handle live tick
          if (data.tick) {
            const price = parseFloat(data.tick.quote);
            const epochMs = data.tick.epoch * 1000;
            processTick(price, epochMs);
          }
        } catch {
          // Ignore parse errors silently
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        connectingRef.current = false;
        setIsConnected(false);
        setError('Connection error');
      };

      ws.onclose = (ev) => {
        if (!mountedRef.current) return;
        connectingRef.current = false;
        setIsConnected(false);
        console.warn('[DerivTicks] WS closed:', ev.code, ev.reason);
        
        // Auto reconnect unless component unmounted
        scheduleReconnect();
      };
    } catch (err) {
      connectingRef.current = false;
      setError('Failed to create WebSocket');
      scheduleReconnect();
      console.error('[DerivTicks] Connect error:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeWs, processTick, scheduleReconnect]);

  // Initial connection + cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    connectWs();

    // Visibility change handler — reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        const elapsed = Date.now() - lastTickTimeRef.current;
        if (elapsed > STALE_TIMEOUT || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[DerivTicks] Tab visible, reconnecting...');
          closeWs();
          connectWs();
        }
      }
    };

    // Online/offline handler
    const handleOnline = () => {
      if (mountedRef.current) {
        console.log('[DerivTicks] Network online, reconnecting...');
        closeWs();
        connectWs();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      closeWs();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    candles,
    currentTick,
    isConnected,
    error,
    currentCandle,
    tickCount,
    lastTickTime,
    reconnectCount,
  };
}
