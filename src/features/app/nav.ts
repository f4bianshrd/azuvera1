import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarOff,
  Building2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  ListTree,
  Home,
  Settings,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon, Award, FileCheck2, BookOpenCheck, RefreshCw, ScrollText, KeyRound, NotebookPen, Scale, LifeBuoy } from "lucide-react";
import type { AppRole } from "./session";
import { REVIEWER_ROLES, VIEWER_ROLES } from "./session";

export type NavSection = "arbeit" | "konto" | "verwaltung";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  section: NavSection;
  /** Ziel-Route; fehlt sie, ist der Punkt noch nicht gebaut. */
  to?: string;
  /** Rollen, die den Punkt sehen; undefined = alle. */
  roles?: AppRole[];
  /** Nur für Mitglieder des Azuvera-Teams (Verwaltung). */
  team?: boolean;
  /** Auch für IT/Technik sichtbar (sonst sieht IT/Technik nur Punkte mit roles: ["it_technik"]). */
  support?: boolean;
}

const TEAM_ROLES: AppRole[] = [...REVIEWER_ROLES, ...VIEWER_ROLES];

/**
 * Endgültige Reihenfolge (Baustein 1B, Abschnitt 10). Punkte ohne `to` erscheinen
 * erst, wenn spätere Bausteine ihre Seite anhängen.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: Home, section: "arbeit", to: "/dashboard" },
  { label: "Berichte", icon: FileText, section: "arbeit", to: "/reports" },
  { label: "Erfahrungsberichte", icon: NotebookPen, section: "arbeit", to: "/erfahrungsberichte" },
  { label: "Leittexte", icon: BookOpenCheck, section: "arbeit", to: "/leittexte" },
  { label: "Ausbilderportal", icon: ClipboardCheck, section: "arbeit", to: "/ausbilder", roles: TEAM_ROLES },
  { label: "Meine Azubis", icon: Users, section: "arbeit", to: "/team", roles: TEAM_ROLES },
  { label: "Ausbildungsplan", icon: CalendarDays, section: "arbeit", to: "/ausbildungsplan" },
  { label: "Unterweisungen", icon: ClipboardCheck, section: "arbeit", to: "/unterweisungen" },
  { label: "Abwesenheiten", icon: CalendarOff, section: "arbeit", to: "/abwesenheiten" },
  { label: "Schulnoten", icon: GraduationCap, section: "arbeit", to: "/noten" },
  { label: "Prüfungsantrag", icon: FileCheck2, section: "arbeit", to: "/pruefungsantrag" },
  { label: "Ausbildungszeugnis", icon: Award, section: "arbeit", to: "/zeugnis" },
  { label: "Erinnerungen", icon: Bell, section: "arbeit", to: "/erinnerungen", roles: REVIEWER_ROLES },
  { label: "Support", icon: LifeBuoy, section: "arbeit", to: "/support", roles: ["it_technik"] },
  { label: "Benachrichtigungen", icon: Bell, section: "konto", to: "/notifications", support: true },
  { label: "Zugriff", icon: KeyRound, section: "konto", to: "/zugriff" },
  { label: "Änderungsprotokoll", icon: ScrollText, section: "konto", to: "/protokoll" },
  { label: "Mein Profil", icon: UserRound, section: "konto", to: "/profil", support: true },
  { label: "Hilfe & Support", icon: LifeBuoy, section: "konto", to: "/hilfe" },
  { label: "Synchronisation", icon: RefreshCw, section: "konto", to: "/sync" },
  { label: "Administration", icon: Settings2, section: "verwaltung", to: "/admin", team: true },
  { label: "Betriebe", icon: Building2, section: "verwaltung", to: "/stammdaten/betriebe", team: true },
  { label: "Berufe", icon: BookOpen, section: "verwaltung", to: "/stammdaten/berufe", team: true },
  { label: "Vorgaben Erfahrungsberichte", icon: Scale, section: "verwaltung", to: "/admin/erfahrungsberichte", team: true },
  { label: "Ausbildungspläne", icon: ListTree, section: "verwaltung", to: "/stammdaten/ausbildungsplaene", team: true },
  { label: "Unterweisungs-Kataloge", icon: ShieldCheck, section: "verwaltung", to: "/stammdaten/unterweisungen", team: true },
  { label: "Einstellungen", icon: Settings, section: "verwaltung", to: "/admin/einstellungen", team: true },
];

export const SECTION_LABELS: Record<NavSection, string> = {
  arbeit: "Arbeitsbereich",
  konto: "Konto",
  verwaltung: "Verwaltung",
};

export function visibleNav(role: AppRole, isTeam = false): NavItem[] {
  if (role === "it_technik") return NAV_ITEMS.filter((i) => i.to && (i.support || i.roles?.includes("it_technik")));
  return NAV_ITEMS.filter((i) => i.to && (i.team ? isTeam : !i.roles || i.roles.includes(role)));
}

export interface TabItem {
  label: string;
  icon: LucideIcon;
  to?: string;
  /** Mittig hervorgehobener Aktions-Button (Azubi: Neuer Bericht). */
  accent?: boolean;
}

/** Feste Tab-Leiste (5 Plätze); Plätze ohne Seite bleiben ausgeblendet. */
export function mobileTabs(role: AppRole): (TabItem | null)[] {
  if (role === "it_technik") {
    return [
      { label: "Support", icon: LifeBuoy, to: "/support" },
      { label: "Hinweise", icon: Bell, to: "/notifications" },
      { label: "Profil", icon: UserRound, to: "/profil" },
      null,
      null,
    ];
  }
  if (role === "azubi") {
    return [
      { label: "Start", icon: Home, to: "/dashboard" },
      { label: "Berichte", icon: FileText, to: "/reports" },
      { label: "Neuer Bericht", icon: ClipboardCheck, accent: true, to: "/reports/new" },
      { label: "Plan", icon: CalendarDays, to: "/ausbildungsplan" },
      null, // „Mehr“ wird vom Shell angehängt
    ];
  }
  return [
    { label: "Start", icon: Home, to: "/dashboard" },
    { label: "Prüfung", icon: ClipboardCheck, to: "/ausbilder" },
    { label: "Azubis", icon: Users, to: "/team" },
    { label: "Plan", icon: CalendarDays, to: "/ausbildungsplan" },
    null,
  ];
}

/** Seitentitel aus dem Pfad ableiten. */
export function titleForPath(pathname: string): string {
  const item = NAV_ITEMS.find((i) => i.to && (pathname === i.to || pathname.startsWith(i.to + "/")));
  if (item) return item.label;
  if (pathname.startsWith("/stammdaten/betriebe")) return "Betriebe";
  if (pathname.startsWith("/stammdaten/berufe")) return "Berufe";
  if (pathname.startsWith("/stammdaten/ausbildungsplaene")) return "Ausbildungspläne";
  if (pathname.startsWith("/ausbildungsplan")) return "Ausbildungsplan";
  if (pathname.startsWith("/zugriff")) return "Zugriff & Einladungen";
  if (pathname.startsWith("/stammdaten/unterweisungen")) return "Unterweisungs-Kataloge";
  return "Azuvera";
}
