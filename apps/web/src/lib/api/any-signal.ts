// Chỉ cho code trình duyệt (AbortSignal.any thiếu trên Safari 16.4–17.3); server dùng thẳng AbortSignal.any
export function anySignal(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.any === 'function')
    return { signal: AbortSignal.any(signals), cleanup: () => undefined };
  const controller = new AbortController();
  const already = signals.find((s) => s.aborted);
  if (already) {
    controller.abort(already.reason); // giữ reason (TimeoutError / AbortError) cho toFetchError
    return { signal: controller.signal, cleanup: () => undefined };
  }
  const listeners = signals.map((s) => {
    const onAbort = () => {
      controller.abort(s.reason);
      cleanup();
    };
    s.addEventListener('abort', onAbort, { once: true });
    return () => s.removeEventListener('abort', onAbort);
  });
  // Gỡ listener khỏi signal sống lâu (signal của TanStack Query) khi request xong
  const cleanup = () => listeners.forEach((off) => off());
  return { signal: controller.signal, cleanup };
}
