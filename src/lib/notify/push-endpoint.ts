/**
 * Erlaubte Web-Push-Dienste (Chrome/Android, Firefox, Safari/Apple, Edge/Windows).
 * Push-Nachrichten werden nur an diese Adressen geschickt – nie an beliebige Server.
 * Dieselbe Liste prüft die Datenbank in register_push_subscription.
 */
const ALLOWED_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((re) => re.test(host));
}
