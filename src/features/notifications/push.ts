import { currentPush, deviceUserAgent, isIosSafari, isStandalone, notificationPermission, pushSupported, registerPush, requestNotificationPermission, sha256Hex, unregisterPush } from '@/lib/platform';
import { getPushConfig, registerPushSubscription, removePushSubscription } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'default' | 'subscribed' | 'granted-not-subscribed';

/** Kurzes Gerätelabel aus dem User-Agent, ohne weitere Gerätedaten. */
export function deviceLabel(ua = deviceUserAgent()): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  const br = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : null;
  const label = [os, br].filter(Boolean).join(' · ');
  return label && label.length <= 80 ? label : 'Dieses Gerät';
}

export async function getPushState(): Promise<PushState> {
  if (isIosSafari() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  const cfg = await getPushConfig().catch(() => ({ configured: false, publicKey: null }));
  if (!cfg.configured) return 'not-configured';
  const perm = notificationPermission();
  if (perm === 'denied') return 'denied';
  if (perm === 'default') return 'default';
  return (await currentPush()) ? 'subscribed' : 'granted-not-subscribed';
}

/** Nur nach Klick: Berechtigung erfragen, anmelden, im Backend speichern. */
export async function enablePush(): Promise<PushState> {
  const cfg = await getPushConfig();
  if (!cfg.configured || !cfg.publicKey) return 'not-configured';
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';
  const keys = await registerPush(cfg.publicKey);
  await registerPushSubscription(keys.endpoint, keys.p256dh, keys.auth, deviceLabel());
  return 'subscribed';
}

export async function disablePush(): Promise<void> {
  const ep = await unregisterPush();
  if (ep) await removePushSubscription(ep).catch(() => undefined);
}

let checked = false;
/** Beim Start (online, angemeldet, erlaubt) höchstens einmal je Sitzung prüfen. */
export async function ensurePushOnStart(): Promise<void> {
  if (checked || !pushSupported() || notificationPermission() !== 'granted') return;
  checked = true;
  try {
    const cfg = await getPushConfig();
    if (!cfg.configured || !cfg.publicKey) return;
    let keys = await currentPush();
    if (!keys || keys.serverKey !== cfg.publicKey) keys = await registerPush(cfg.publicKey);
    await registerPushSubscription(keys.endpoint, keys.p256dh, keys.auth, deviceLabel());
  } catch { checked = false; }
}

export async function currentEndpointHash(): Promise<string | null> {
  const k = await currentPush();
  return k ? sha256Hex(k.endpoint) : null;
}
export async function currentEndpoint(): Promise<string | null> {
  return (await currentPush())?.endpoint ?? null;
}
