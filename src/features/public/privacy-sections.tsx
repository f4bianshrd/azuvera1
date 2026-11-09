import type { ReactNode } from "react";
import { Clock, Cookie, Database, FileText, Mail, Scale, Server, ShieldCheck, type LucideIcon } from "lucide-react";
import { linkCls } from "./public-layout";

export interface PrivacySection {
  id: string;
  title: string;
  icon: LucideIcon;
  content: ReactNode;
}

const Mailto = () => <a className={linkCls} href="mailto:info@azuvera.de">info@azuvera.de</a>;
const Tel = () => <a className={linkCls} href="tel:+4915569490721">+49 155 69490721</a>;
const Block = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl bg-muted p-4 text-foreground">{children}</div>
);
const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
);

/** Speicherort; wird in Teil B aus app_settings.hosting_location_text gelesen. */
export const HOSTING_LOCATION_DEFAULT = "innerhalb der EU";

/** Weitere Abschnitte (Baustein 5) einfach an diese Liste anhängen. */
export function privacySections(hostingLocation: string = HOSTING_LOCATION_DEFAULT): PrivacySection[] {
  return [
    {
      id: "verantwortlicher", title: "Verantwortlicher", icon: ShieldCheck,
      content: (<>
        <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und anderer nationaler Datenschutzgesetze:</p>
        <Block><p className="font-semibold">Fabian Schröder</p><p>Privat Entwickelt</p><p>Hüdepohlweg 8, 49326 Melle</p><p>E-Mail: <Mailto /></p><p>Telefon: <Tel /></p></Block>
      </>),
    },
    {
      id: "erhebung", title: "Erhebung und Verarbeitung von Daten", icon: Database,
      content: (<>
        <p>Bei der Nutzung von Azuvera werden personenbezogene Daten erhoben, die für den Betrieb des digitalen Berichtshefts erforderlich sind. Dazu gehören:</p>
        <List items={["Name und E-Mail-Adresse (zur Authentifizierung)", "Ausbildungsberuf, Ausbildungsjahr und Ausbildungsbeginn", "Berichte, Abwesenheiten und Schulnoten", "Kommentare und Freigabeinformationen", "Elektronische Unterschriften (nur nach Freigabe)"]} />
        <p>Die Daten werden ausschließlich für die Verwaltung und Dokumentation der Ausbildung verwendet.</p>
      </>),
    },
    {
      id: "rechtsgrundlage", title: "Rechtsgrundlage und Zweck", icon: Scale,
      content: (<>
        <p>Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse), soweit dies für die sichere Bereitstellung der Plattform erforderlich ist.</p>
        <p>Zweck der Verarbeitung ist die digitale Erfassung, Prüfung und Archivierung von Ausbildungsnachweisen.</p>
      </>),
    },
    {
      id: "hosting", title: "Hosting und Auftragsverarbeitung", icon: Server,
      content: (<>
        <p>Azuvera wird über ein Cloud-Backend (Lovable Cloud) betrieben. Die Daten werden in sicheren Rechenzentren {hostingLocation} gespeichert. Ein Auftragsverarbeitungsvertrag (AVV) mit dem Dienstanbieter liegt vor.</p>
        <p>Die Website wird über Lovable bereitgestellt; die Anwendungsdaten werden im sicheren Backend verarbeitet.</p>
      </>),
    },
    {
      id: "cookies", title: "Cookies und Analyse", icon: Cookie,
      content: <p>Azuvera verwendet technisch notwendige Cookies, um die Anmeldung und Sicherheit zu gewährleisten. Es werden keine Tracking- oder Marketing-Cookies ohne Einwilligung eingesetzt.</p>,
    },
    {
      id: "rechte", title: "Betroffenenrechte", icon: FileText,
      content: (<>
        <p>Nutzer:innen haben folgende Rechte nach der DSGVO:</p>
        <List items={["Recht auf Auskunft (Art. 15 DSGVO)", "Recht auf Berichtigung (Art. 16 DSGVO)", "Recht auf Löschung (Art. 17 DSGVO)", "Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)", "Recht auf Datenübertragbarkeit (Art. 20 DSGVO)", "Recht auf Widerspruch (Art. 21 DSGVO)"]} />
        <p>Anfragen zu diesen Rechten können per E-Mail an <Mailto /> gestellt werden.</p>
      </>),
    },
    {
      id: "speicherdauer", title: "Speicherdauer und Löschung", icon: Clock,
      content: <p>Personenbezogene Daten werden nur so lange gespeichert, wie es für die Nutzung der Plattform oder gesetzliche Aufbewahrungsfristen erforderlich ist. Nach Vertragsende oder Löschung des Kontos werden die Daten innerhalb angemessener Fristen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>,
    },
    {
      id: "kontakt", title: "Kontakt", icon: Mail,
      content: (<>
        <p>Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte wenden Sie sich bitte an:</p>
        <Block><p className="font-semibold">Fabian Schröder</p><p>E-Mail: <Mailto /></p><p>Telefon: <Tel /></p></Block>
      </>),
    },
  ];
}
