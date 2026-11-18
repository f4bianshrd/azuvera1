// Bereitet den Client-Build für das App-Paket vor (nur nativer Build, die Web-App bleibt unberührt):
// Capacitor erwartet dist/client/index.html; TanStack Start schreibt im SPA-Modus dist/client/_shell.html.
// Unbekannte Pfade (z. B. /dashboard) beantwortet Capacitor automatisch mit index.html.
import { copyFileSync, existsSync, rmSync } from "node:fs";

const dir = "dist/client";
const shell = `${dir}/_shell.html`;
if (!existsSync(shell)) {
  console.error(`Fehlt: ${shell} – lief der Build im SPA-Modus?`);
  process.exit(1);
}
copyFileSync(shell, `${dir}/index.html`);
// Nur fürs Web-Hosting relevant; im App-Paket überflüssig.
for (const f of ["_headers", "robots.txt", "sitemap.xml"]) rmSync(`${dir}/${f}`, { force: true });
console.log("dist/client/index.html bereit für Capacitor.");
