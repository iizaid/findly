const providerState = new Map();

export const createProviderThrottle = ({
  concurrency = 1,
  windowMs = 60_000,
  maxPerWindow = 60,
} = {}) => ({
  concurrency,
  windowMs,
  maxPerWindow,
});

export const getProviderThrottleState = (providerKey) => providerState.get(providerKey) || {
  running: 0,
  windowStartedAt: 0,
  count: 0,
};

export const canRunProviderRequest = (providerKey, throttle) => {
  const now = Date.now();
  const state = getProviderThrottleState(providerKey);
  const windowExpired = now - state.windowStartedAt >= throttle.windowMs;
  const normalizedState = windowExpired
    ? { running: state.running, windowStartedAt: now, count: 0 }
    : state;

  providerState.set(providerKey, normalizedState);

  return normalizedState.running < throttle.concurrency && normalizedState.count < throttle.maxPerWindow;
};

export const trackProviderRequestStart = (providerKey, throttle) => {
  if (!canRunProviderRequest(providerKey, throttle)) return false;
  const state = getProviderThrottleState(providerKey);
  providerState.set(providerKey, {
    ...state,
    running: state.running + 1,
    count: state.count + 1,
  });
  return true;
};

export const trackProviderRequestEnd = (providerKey) => {
  const state = getProviderThrottleState(providerKey);
  providerState.set(providerKey, {
    ...state,
    running: Math.max(0, state.running - 1),
  });
};
