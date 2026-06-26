export function logEvent(eventName: string, params?: Record<string, any>) {
  console.log(`[EVLO Analytics] Event: ${eventName}`, params || {});
}
