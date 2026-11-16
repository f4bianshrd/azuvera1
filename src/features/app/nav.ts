import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarOff,
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
  type LucideIcon, RefreshCw, ScrollText, QrCode, NotebookPen, Scale } from "lucide-react";
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
  { label: "Ausbilderportal", icon: ClipboardCheck, section: "arbeit", to: "/ausbilder", roles: TEAM_ROLES },
  { label: "Team", icon: Users, section: "arbeit", to: "/team", roles: TEAM_ROLES },
  { label: "Ausbildungsplan", icon: CalendarDays, section: "arbeit", to: "/ausbildungsplan" },
  { label: "Unterweisungen", icon: ClipboardCheck, section: "arbeit", to: "/unterweisungen" },
  { label: "Abwesenheiten", icon: CalendarOff, section: "arbeit", to: "/abwesenheiten" },
  { label: "Schulnoten", icon: GraduationCap, section: "arbeit", to: "/noten" },
  { label: "Erinnerungen", icon: Bell, section: "arbeit", to: "/erinnerungen", roles: REVIEWER_ROLES },
  { label: "Verknüpfungen", icon: QrCode, section: "konto", to: "/verknuepfungen" },
  { label: "Benachrichtigungen", icon: Bell, section: "konto", to: "/notifications" },
  { label: "Änderungsprotokoll", icon: ScrollText, section: "konto", to: "/protokoll" },
  { label: "Mein Profil", icon: UserRound, section: "konto", to: "/profil" },
  { label: "Synchronisation", icon: RefreshCw, section: "konto", to: "/sync" },
  { label: "Administration", icon: Settings2, section: "verwaltung", to: "/admin", roles: ["ausbildungsleitung"] },
  { label: "Betriebe", icon: Building2, section: "verwaltung", to: "/stammdaten/betriebe", roles: ["ausbildungsleitung"] },
  { label: "Berufe", icon: BookOpen, section: "verwaltung", to: "/stammdaten/berufe", roles: ["ausbildungsleitung"] },
  { label: "Vorgaben Erfahrungsberichte", icon: Scale, section: "verwaltung", to: "/admin/erfahrungsberichte", roles: ["ausbildungsleitung"] },
  { label: "Ausbildungspläne", icon: ListTree, section: "verwaltung", to: "/stammdaten/ausbildungsplaene", roles: ["ausbildungsleitung"] },
  { label: "Unterweisungs-Kataloge", icon: ShieldCheck, section: "verwaltung", to: "/stammdaten/unterweisungen", roles: ["ausbildungsleitung"] },
  { label: "Einstellungen", icon: Settings, section: "verwaltung", to: "/admin/einstellungen", roles: ["ausbildungsleitung"] },
];

export const SECTION_LABELS: Record<NavSection, string> = {
  arbeit: "Arbeitsbereich",
  konto: "Konto",
  verwaltung: "Verwaltung",
};

export function visibleNav(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((i) => i.to && (!i.roles || i.roles.includes(role)));
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
    { label: "Team", icon: Users, to: "/team" },
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
  if (pathname.startsWith("/verknuepfungen")) return "Verknüpfungen";
  if (pathname.startsWith("/stammdaten/unterweisungen")) return "Unterweisungs-Kataloge";
  return "Azuvera";
}
