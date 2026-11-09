import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  History,
  Home,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
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
  { label: "Berichte", icon: FileText, section: "arbeit" },
  { label: "Team", icon: Users, section: "arbeit", roles: TEAM_ROLES },
  { label: "Ausbildungsplan", icon: CalendarDays, section: "arbeit" },
  { label: "Unterweisungen", icon: ShieldCheck, section: "arbeit" },
  { label: "Abwesenheiten", icon: ClipboardList, section: "arbeit" },
  { label: "Schulnoten", icon: GraduationCap, section: "arbeit" },
  { label: "Erinnerungen", icon: Bell, section: "arbeit" },
  { label: "Benachrichtigungen", icon: Bell, section: "konto", to: "/benachrichtigungen" },
  { label: "Änderungsprotokoll", icon: History, section: "konto", to: "/aenderungsprotokoll" },
  { label: "Mein Profil", icon: UserRound, section: "konto", to: "/profil" },
  { label: "Administration", icon: Settings2, section: "verwaltung", to: "/admin", roles: ["ausbildungsleitung"] },
  { label: "Betriebe", icon: Building2, section: "verwaltung", to: "/stammdaten/betriebe", roles: ["ausbildungsleitung"] },
  { label: "Berufe", icon: BookOpen, section: "verwaltung", to: "/stammdaten/berufe", roles: ["ausbildungsleitung"] },
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
      { label: "Berichte", icon: FileText },
      { label: "Neuer Bericht", icon: ClipboardCheck, accent: true },
      { label: "Plan", icon: CalendarDays },
      null, // „Mehr“ wird vom Shell angehängt
    ];
  }
  return [
    { label: "Start", icon: Home, to: "/dashboard" },
    { label: "Prüfung", icon: ClipboardCheck },
    { label: "Team", icon: Users },
    { label: "Plan", icon: CalendarDays },
    null,
  ];
}

/** Seitentitel aus dem Pfad ableiten. */
export function titleForPath(pathname: string): string {
  const item = NAV_ITEMS.find((i) => i.to && (pathname === i.to || pathname.startsWith(i.to + "/")));
  if (item) return item.label;
  if (pathname.startsWith("/stammdaten/betriebe")) return "Betriebe";
  if (pathname.startsWith("/stammdaten/berufe")) return "Berufe";
  return "Azuvera";
}

export { ScrollText };
