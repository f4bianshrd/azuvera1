import { buildPushPayload } from "@block65/webcrypto-web-push";
import { isAllowedPushEndpoint } from "./push-endpoint";

export function pushConfigured() {
  const e = process.env;
  return !!(e["VAPID_PUBLIC_KEY"] && e["VAPID_PRIVATE_KEY"] && e["VAPID_SUBJECT"]);
}

/** Sendet eine verschlüsselte Web-Push-Nachricht (RFC 8291/8292). Rückgabe: HTTP-Status des Push-Dienstes. */
export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string; tag: string },
  ttl = 86_400,
): Promise<number> {
  // Nur bekannte Push-Dienste anschreiben; fremde Adressen gelten als abgemeldet (410 → Eintrag wird entfernt).
  if (!isAllowedPushEndpoint(sub.endpoint)) return 410;
  const e = process.env;
  const vapid = { subject: e["VAPID_SUBJECT"]!, publicKey: e["VAPID_PUBLIC_KEY"]!, privateKey: e["VAPID_PRIVATE_KEY"]! };
  const req = await buildPushPayload(
    { data: JSON.stringify(payload), options: { ttl, urgency: "normal" } },
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    vapid,
  );
  const res = await fetch(sub.endpoint, { ...(req as RequestInit), redirect: "manual" });
  return res.status;
}
