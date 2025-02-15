export function checkMaxListeners(listenersCount: number, maxListeners: number) {
  if (listenersCount > maxListeners) {
    console.warn(
      `Possible EventEmitter memory leak detected: ${listenersCount} listeners / ${maxListeners} max. Use options "maxListeners" to increase the limit.`,
    );
  }
}
