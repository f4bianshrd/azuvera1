import { Bell, BellRing, CalendarOff, CheckCircle2, ClipboardCheck, ClipboardList, FileText, MessageSquare, RotateCcw, Undo2, UserRoundCog, type LucideIcon } from 'lucide-react';

export const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  report_submitted: FileText, report_approved: CheckCircle2, report_rejected: RotateCcw, report_reopened: Undo2,
  comment: MessageSquare, absence_requested: CalendarOff, absence_approved: CalendarOff, absence_rejected: CalendarOff,
  report_reminder: BellRing, deputy_assigned: UserRoundCog, deputy_ended: UserRoundCog,
  deadline_soon: BellRing, deadline_today: BellRing, deadline_overdue: BellRing, review_pending: BellRing, daily_nudge: BellRing,
  instruction_due: ClipboardCheck, instruction_submitted: ClipboardList, instruction_confirmed: CheckCircle2, instruction_rejected: RotateCcw,
};
export const iconFor = (type: string): LucideIcon => NOTIFICATION_ICONS[type] ?? Bell;

/** Nur interne Pfade öffnen. */
export function internalTarget(link: string | null | undefined): { to: string; search: Record<string, string>; hash?: string } | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  const url = new URL(link, 'https://x.invalid');
  const hash = url.hash.replace(/^#/, '');
  return { to: url.pathname, search: Object.fromEntries(url.searchParams), ...(hash ? { hash } : {}) };
}
