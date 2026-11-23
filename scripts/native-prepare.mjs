// Bereitet den Client-Build für das App-Paket vor (nur nativer Build, die Web-App bleibt unberührt):
// Capacitor erwartet dist/client/index.html; TanStack Start schreibt im SPA-Modus _shell.html.
// In der Lovable-Umgebung landet der Client-Build in dist/client, außerhalb (z. B. GitHub Actions)
// legt nitro ihn unter .output/public ab – beide Orte werden unterstützt.
// Unbekannte Pfade (z. B. /dashboard) beantwortet Capacitor automatisch mit index.html.
import { copyFileSync, cpSync, existsSync, rmSync } from "node:fs";

const target = "dist/client";
const candidates = [target, ".output/public"];
const source = candidates.find((d) => existsSync(`${d}/_shell.html`));
if (!source) {
  console.error(`Fehlt: _shell.html in ${candidates.join(" oder ")} – lief der Build im SPA-Modus?`);
  process.exit(1);
}
if (source !== target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  console.log(`Client-Build aus ${source} nach ${target} übernommen.`);
}
copyFileSync(`${target}/_shell.html`, `${target}/index.html`);
// Nur fürs Web-Hosting relevant; im App-Paket überflüssig.
for (const f of ["_headers", "robots.txt", "sitemap.xml"]) rmSync(`${target}/${f}`, { force: true });
console.log("dist/client/index.html bereit für Capacitor.");
