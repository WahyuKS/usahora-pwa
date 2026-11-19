// Device notifications on the web (installed PWA or browser tab).
// Honest limit: without a push server a notification can only be shown while USAHORA is open
// (we show one when the app is opened on a day with bills to collect). No background push.

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;
export const notifyPermission = (): "granted" | "denied" | "default" | "unsupported" =>
  notifySupported() ? ((window as any).Notification.permission as any) : "unsupported";

export async function requestNotifyPermission(): Promise<boolean> {
  if (!notifySupported()) return false;
  try {
    return (await (window as any).Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Shows a system notification. Uses the service worker when available (required on Android Chrome). */
export async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (notifyPermission() !== "granted") return false;
  const options = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  try {
    const reg = await (navigator as any).serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
    new (window as any).Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
