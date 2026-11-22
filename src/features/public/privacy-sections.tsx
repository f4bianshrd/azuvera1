import type { ReactNode } from "react";
import { BarChart3, Bell, Clock, Cookie, Database, FileText, History, KeyRound, Mail, Mic, Paperclip, Scale, Server, ShieldCheck, Sparkles, UserCheck, WifiOff, LifeBuoy, type LucideIcon } from "lucide-react";
import { PRIVACY_TEXT_DEFAULTS, type PrivacyTexts } from "@/lib/legal";
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

/** Speicherort und Anbieter kommen aus app_settings (hosting_location_text, ai_provider_text, email_provider_text). */
export function privacySections(texts: PrivacyTexts = PRIVACY_TEXT_DEFAULTS): PrivacySection[] {
  const { hostingLocation, aiProvider, emailProvider } = texts;
  return [
    {
      id: "verantwortlicher", title: "Verantwortlicher", icon: ShieldCheck,
      content: (<>
        <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und anderer nationaler Datenschutzgesetze:</p>
        <Block><p className="font-semibold">Azuvera – Eine Marke der Stage & Spotlight</p><p>Inh. Fabian Schröder</p><p>Hüdepohlweg 8, 49326 Melle</p><p>E-Mail: <Mailto /></p><p>Telefon: <Tel /></p><p>Web: <a className={linkCls} href="https://www.stage-spotlight.de" target="_blank" rel="noreferrer">www.stage-spotlight.de</a></p></Block>
      </>),
    },
    {
      id: "erhebung", title: "Erhebung und Verarbeitung von Daten", icon: Database,
      content: (<>
        <p>Bei der Nutzung von Azuvera werden personenbezogene Daten erhoben, die für den Betrieb des digitalen Berichtshefts erforderlich sind. Dazu gehören:</p>
        <List items={["Name und E-Mail-Adresse (zur Authentifizierung)", "Ausbildungsberuf, Ausbildungsjahr, Ausbildungsbeginn und Bundesland des Ausbildungsbetriebs", "Berichte, Erfahrungsberichte, bearbeitete Leittexte, Abwesenheiten und Schulnoten", "Fotos und PDF-Dateien, die an Berichte, Erfahrungsberichte und Leittexte angehängt werden", "Kommentare und Freigabeinformationen", "Rolle und Organisation (bei Ausbilderinnen, Betrieben, Kammern, Prüfern und Schulen)", "Einladungs-Codes und Zugriffe auf Berichtshefte", "Unterweisungsnachweise (Thema, Datum, Dauer, unterweisende Person, Notiz)", "Ausbildungszeugnis (Antrag, Inhalt, ausstellende Person) und Antrag auf Zulassung zur Abschlussprüfung (z. B. Geburtsdatum, Geburtsort, Anschrift, Schulabschluss, zuständige Kammer, freiwillige Angaben zu Nachteilsausgleich)", "Elektronische Unterschriften (beim Einreichen und bei der Freigabe)", "Einstellungen für Benachrichtigungen und technische Gerätekennungen für Push-Mitteilungen"]} />
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
      content: <p>Azuvera verwendet technisch notwendige Cookies, um die Anmeldung und Sicherheit zu gewährleisten. Es werden keine Tracking- oder Marketing-Cookies ohne Einwilligung eingesetzt. Zur lokalen Speicherung für den Offline-Betrieb siehe den Abschnitt „Offline-Nutzung und lokale Speicherung“. Zur anonymen Besucherstatistik siehe den Abschnitt „Besucherstatistik“.</p>,
    },
    {
      id: "anmeldung", title: "Anmeldung über Drittanbieter und E-Mail-Änderung", icon: KeyRound,
      content: (<>
        <p>Sie können sich wahlweise mit E-Mail-Adresse und Passwort oder über Ihr Konto bei Google, Apple oder Microsoft anmelden. Wenn Sie einen Drittanbieter wählen, übermittelt dieser uns nach Ihrer Freigabe Ihren Namen und Ihre E-Mail-Adresse; wir erhalten kein Passwort von Ihnen. Sie können im Profil weitere Anmeldemöglichkeiten mit derselben E-Mail-Adresse verbinden oder ein Passwort festlegen (Art. 6 Abs. 1 lit. b DSGVO).</p>
        <p>Wenn Sie Ihre E-Mail-Adresse im Profil ändern, senden wir einen Bestätigungslink an die neue Adresse. Erst nach der Bestätigung gilt die neue Adresse.</p>
      </>),
    },
    {
      id: "besucherstatistik", title: "Besucherstatistik", icon: BarChart3,
      content: (<>
        <p>Auf dieser Website nutzen wir die Besucherstatistik von Lovable. Sie verwendet keine Cookies, speichert nichts auf Ihrem Gerät, speichert keine IP-Adressen und kann Sie nicht als Person wiedererkennen. Lovable erhebt diese Daten für uns. <a className={linkCls} href="https://lovable.dev/privacy" target="_blank" rel="noreferrer">Die Datenschutzerklärung von Lovable</a> erklärt, wie Lovable damit umgeht.</p>
        <p>Aufgezeichnet werden bei jedem Besuch: die besuchten Seiten, woher Sie kamen, Ihr Land, Browser, Betriebssystem und Geräteart, wie lange Sie bleiben, wie schnell die Seiten laden, Fehler sowie welche Schaltflächen und Links Sie anklicken. Die Einzeldaten werden 90 Tage aufbewahrt, tägliche Zusammenfassungen ein Jahr.</p>
      </>),
    },
    {
      id: "rechte", title: "Betroffenenrechte", icon: FileText,
      content: (<>
        <p>Nutzer:innen haben folgende Rechte nach der DSGVO:</p>
        <List items={["Recht auf Auskunft (Art. 15 DSGVO)", "Recht auf Berichtigung (Art. 16 DSGVO)", "Recht auf Löschung (Art. 17 DSGVO)", "Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)", "Recht auf Datenübertragbarkeit (Art. 20 DSGVO)", "Recht auf Widerspruch (Art. 21 DSGVO)"]} />
        <p>Anfragen zu diesen Rechten können per E-Mail an <Mailto /> gestellt werden. Auskunft, Datenexport und Löschantrag stehen auch in der App unter Mein Profil im Bereich „Meine Daten“ bereit.</p>
        <p>Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), zum Beispiel bei der Behörde Ihres Wohnorts oder Ihres Bundeslands.</p>
      </>),
    },
    {
      id: "speicherdauer", title: "Speicherdauer und Löschung", icon: Clock,
      content: (<>
        <p>Personenbezogene Daten werden nur so lange gespeichert, wie es für die Nutzung der Plattform oder gesetzliche Aufbewahrungsfristen erforderlich ist. Nach Vertragsende oder Löschung des Kontos werden die Daten innerhalb angemessener Fristen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
        <p>Die Löschung eines Kontos können Sie in der App unter Mein Profil beantragen; das Azuvera-Team führt sie aus.</p>
      </>),
    },
    {
      id: "diktat", title: "Spracheingabe (Diktat)", icon: Mic,
      content: (<>
        <p>Azuvera bietet optional eine Diktierfunktion. Sie nutzt die Spracherkennung Ihres Browsers. Je nach Browser wird der Ton zur Umwandlung in Text an den Hersteller des Browsers übertragen (Chrome: Google, Safari: Apple). Azuvera empfängt und speichert keine Tonaufnahmen.</p>
        <p>Die Funktion wird erst nach Ihrer ausdrücklichen Einwilligung freigeschaltet (Art. 6 Abs. 1 lit. a DSGVO). Sie können die Einwilligung jederzeit unter Mein Profil widerrufen; die bis dahin erfolgte Verarbeitung bleibt rechtmäßig.</p>
      </>),
    },
    {
      id: "ki-text", title: "KI-Textvorschläge", icon: Sparkles,
      content: (<>
        <p>Auszubildende können sich aus Stichpunkten einen Textvorschlag für ihren Bericht erstellen lassen. Dafür übermittelt Azuvera die eingegebenen Stichpunkte und die Bezeichnung des Ausbildungsberufs an {aiProvider}. Der Vorschlag wird nur angezeigt und erst übernommen, wenn die Azubi-Person es bestätigt. Azuvera speichert weder die Stichpunkte noch den Vorschlag auf dem Server, sondern nur, wann die Funktion genutzt wurde (Zeitpunkt, Zeichenzahlen) und dass ein Vorschlag übernommen wurde.</p>
        <p>Die Funktion wird erst nach Ihrer ausdrücklichen Einwilligung freigeschaltet (Art. 6 Abs. 1 lit. a DSGVO) und kann jederzeit unter Mein Profil widerrufen werden. Bitte geben Sie keine Namen von Kunden oder anderen Personen ein.</p>
      </>),
    },
    {
      id: "benachrichtigungen", title: "Benachrichtigungen per Push und E-Mail", icon: Bell,
      content: (<>
        <p>Azuvera informiert über Ereignisse wie Einreichung, Freigabe, Zurückweisung, Kommentare, Abwesenheitsanträge und Vertretungen sowie über fehlende Berichte und nahende Fristen – in der App, per Push-Mitteilung und per E-Mail. Unter Mein Profil stellen Sie ein, welche Arten Sie auf welchem Weg erhalten.</p>
        <p>Für Push-Mitteilungen speichert Azuvera pro Gerät die technischen Angaben, die Ihr Browser für den Push-Dienst bereitstellt (Endpunkt-Adresse und Schlüssel), und eine Gerätebezeichnung. Die Zustellung läuft über den Push-Dienst des jeweiligen Browser- oder Geräteherstellers (zum Beispiel Google, Apple oder Mozilla). Push-Mitteilungen erhalten Sie nur, wenn Sie sie in Ihrem Browser erlauben und das Gerät in der App registrieren (Art. 6 Abs. 1 lit. a DSGVO); jedes Gerät lässt sich in der App wieder entfernen.</p>
        <p>E-Mails versenden wir über {emailProvider} an die E-Mail-Adresse Ihres Kontos (Art. 6 Abs. 1 lit. b DSGVO). Sie enthalten kurze Hinweise und keine Berichtsinhalte.</p>
      </>),
    },
    {
      id: "anhaenge", title: "Anhänge (Fotos und Dateien)", icon: Paperclip,
      content: <p>An Berichte und Erfahrungsberichte lassen sich je bis zu 10 Fotos oder PDF-Dateien anhängen (je Datei höchstens 10 MB). Fotos werden vor dem Hochladen im Browser neu codiert; dabei gehen Metadaten wie der Aufnahmeort verloren. Die Dateien liegen in einem nicht öffentlichen Speicher und sind nur für Personen abrufbar, die den Bericht einsehen dürfen; Entwürfe sieht ausschließlich die Azubi-Person (Art. 6 Abs. 1 lit. b DSGVO). Bitte laden Sie keine Dateien mit Gesundheitsdaten oder Daten Dritter hoch.</p>,
    },
    {
      id: "zugriff", title: "Zugriff durch eingeladene Personen", icon: UserCheck,
      content: (<>
        <p>Auszubildende entscheiden selbst, wer ihr Berichtsheft einsehen darf. Dafür erzeugen sie einen Einladungs-Code für eine Ausbilderin oder einen Ausbilder, eine Betriebsleiterin oder einen Betriebsleiter, eine Ausbildungsberaterin oder einen Ausbildungsberater, eine Prüferin oder einen Prüfer oder eine Lehrerin oder einen Lehrer. Wer den Code einlöst, sieht die eingereichten und freigegebenen Berichte, Erfahrungsberichte und Leittexte, eingereichte Prüfungsanträge und ausgestellte Ausbildungszeugnisse mit Anhängen, Kommentaren und Unterschriften, die Abwesenheiten, die Schulnoten, den Ausbildungsplan und die Profilangaben der Azubi-Person; Entwürfe sieht ausschließlich die Azubi-Person; Zeugnisentwürfe sehen nur Personen mit Prüfrecht, bis das Zeugnis ausgestellt ist. Der Zugriff lässt sich jederzeit beenden und endet bei Prüferinnen und Prüfern automatisch (Art. 6 Abs. 1 lit. a DSGVO).</p>
        <p>Ausbilderinnen und Ausbilder, Betriebsleiterinnen und Betriebsleiter sowie Ausbildungsberaterinnen und Ausbildungsberater dürfen Berichte prüfen, kommentieren und freigeben; Prüferinnen und Prüfer sowie Lehrerinnen und Lehrer lesen nur. Die Ausbildungsleitung betreut die Ausbildung und kann dafür alle eingereichten Berichtshefte einsehen und prüfen.</p>
        <p>Das Azuvera-Team verwaltet Konten, Berufe, Pläne und Einstellungen. Team-Mitglieder ohne die Rolle Ausbildungsleitung haben keinen Zugriff auf Berichte, Erfahrungsberichte, Kommentare, Unterschriften oder Profilangaben der Auszubildenden. Azuvera prüft nicht, ob die Angaben einer eingeladenen Person zu Rolle und Organisation zutreffen; die Azubi-Person entscheidet, wem sie ihren Code gibt.</p>
      </>),
    },
    {
      id: "support", title: "Support-Zugriff (IT/Technik)", icon: LifeBuoy,
      content: (<>
        <p>Wenn Sie Hilfe brauchen, kann der Azuvera-Support (Rolle IT/Technik) auf Ihr Konto zugreifen – aber nur, nachdem Ihre Identität bestätigt wurde. Ohne Bestätigung sieht der Support lediglich eine pseudonyme Support-ID, Ihre Rolle, das Registrierungsdatum und den Kontostatus.</p>
        <p>Die Bestätigung erfolgt entweder über ein Support-Ticket, das Sie selbst unter „Hilfe & Support“ erstellen (mit einem 16-stelligen Einmal-Code, den Sie dem Support nennen), oder bei Anruf bzw. E-Mail durch Abgleich von Vorname, Nachname, Geburtsdatum, E-Mail-Adresse und – falls hinterlegt – Telefonnummer. Die eingegebenen Prüfangaben werden nicht gespeichert; festgehalten wird nur, ob die Prüfung erfolgreich war. Mit einem Ticket darf der Support Ihre Daten lesen und nur das ändern, was Sie ausdrücklich freigegeben haben; nach einer Identitätsprüfung ist der Zugriff auf 30 Minuten begrenzt. Passwörter, Rollen, Kontolöschung sowie Lizenz- und Zahlungsdaten sind für den Support immer gesperrt; die Mitarbeitenden nutzen eine Zwei-Faktor-Anmeldung.</p>
        <p>Jeder Zugriff (Ansehen, Ändern, Löschen, Beginn und Ende einer Sitzung) wird unveränderlich protokolliert, mit Zeitpunkt, handelnder Person und den Namen der geänderten Felder, aber ohne Inhalte. Sie sehen dieses Protokoll unter „Hilfe & Support“, werden über jede Sitzung und jeden fehlgeschlagenen Prüfversuch benachrichtigt und können einen Ticket-Zugriff jederzeit sofort beenden. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung Ihrer Support-Anfrage) sowie Art. 6 Abs. 1 lit. f DSGVO (Schutz vor unberechtigtem Zugriff und Nachweis).</p>
      </>),
    },
    {
      id: "offline", title: "Offline-Nutzung und lokale Speicherung", icon: WifiOff,
      content: <p>Damit Azuvera auch ohne Internetverbindung funktioniert, speichert die App Daten lokal in Ihrem Browser: Berichte, Erfahrungsberichte, Leittexte und Anhänge, noch nicht gesendete Änderungen, Einstellungen und zuletzt geladene Übersichten (lokale Datenbank, IndexedDB) sowie die Programmdateien der App (Service Worker, Zwischenspeicher). Diese Speicherung ist für den von Ihnen ausdrücklich gewünschten Offline-Betrieb erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Beim Abmelden löscht die App die lokale Datenbank. Ihre Anmeldung bleibt im Browser gespeichert, damit Sie beim Neuladen angemeldet bleiben; ohne den Haken „Angemeldet bleiben“ wird sie beim nächsten Start nach dem Schließen des Browsers verworfen. Sie ist nicht zusätzlich verschlüsselt; nutzen Sie auf gemeinsam genutzten Geräten deshalb immer die Abmeldung und eine Bildschirmsperre.</p>,
    },
    {
      id: "protokoll", title: "Änderungsprotokoll und Aufbewahrung", icon: History,
      content: <p>Azuvera protokolliert, wann ein Bericht oder Erfahrungsbericht angelegt, geändert, eingereicht, freigegeben, zurückgewiesen oder wieder geöffnet wurde und wer die Handlung ausgeführt hat. Das Protokoll kann nachträglich nicht verändert werden und ist durch Prüfsummen verkettet. Es enthält technische Kennungen, Zeitpunkte, Statuswerte und Prüfsummen, aber keine Klarnamen und keine Berichtstexte. Es dient dem Nachweis einer ordnungsgemäßen Führung des Ausbildungsnachweises und der Unversehrtheit der Daten (Art. 6 Abs. 1 lit. b und f DSGVO). Wird ein Konto gelöscht, bleiben die Protokolleinträge mit ihren technischen Kennungen bestehen.</p>,
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
