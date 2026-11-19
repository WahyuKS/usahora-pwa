// Native app build: local notifications need expo-notifications, which is not part of this app yet.
// The in-app "Perlu ditagih" card on the dashboard still works.
export const notifySupported = () => false;
export const notifyPermission = (): "granted" | "denied" | "default" | "unsupported" => "unsupported";
export async function requestNotifyPermission(): Promise<boolean> {
  return false;
}
export async function showNotification(_title: string, _body: string, _tag: string): Promise<boolean> {
  return false;
}
