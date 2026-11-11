import type { Report, ReportStatus, ReportType } from "@/features/reports/api";

export function isOverdue(submittedAt: string | null, now = new Date()): boolean {
  return !!submittedAt && now.getTime() - new Date(submittedAt).getTime() >= 7 * 86400000;
}

export function reviewAgeLabel(submittedAt: string | null, now = new Date()): string {
  if (!submittedAt) return "Eingereicht";
  const days = Math.max(0, Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 86400000));
  if (days === 0) return "heute eingereicht";
  if (days === 1) return "eingereicht vor 1 Tag";
  return `eingereicht vor ${days} Tagen`;
}

export function filterVisibleReports<T extends Pick<Report, "azubi_id" | "report_type" | "report_date" | "week_number" | "status" | "reviewer_id" | "reviewed_at">>(
  reports: T[],
  options: { search: string; azubiId: string; type: ReportType | "all"; status?: ReportStatus | "all"; todayApprovedBy?: string | undefined },
  nameFor: (id: string) => string,
): T[] {
  const search = options.search.trim().toLowerCase();
  return reports.filter((report) => {
    if (options.azubiId && report.azubi_id !== options.azubiId) return false;
    if (options.type !== "all" && report.report_type !== options.type) return false;
    if (options.status && options.status !== "all" && report.status !== options.status) return false;
    if (options.todayApprovedBy && (report.reviewer_id !== options.todayApprovedBy || !report.reviewed_at || report.reviewed_at < berlinStartOfDay(new Date()))) return false;
    if (!search) return true;
    const haystack = [nameFor(report.azubi_id), report.report_date, report.week_number ? `kw ${report.week_number}` : "", report.status].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

export function bulkSummary(approved: number, skipped: { message: string }[]): string {
  const base = `${approved} freigegeben`;
  if (skipped.length === 0) return `${base}.`;
  const messages = [...new Set(skipped.map((item) => item.message))].join(" ");
  return `${base}, ${skipped.length} übersprungen: ${messages}`;
}

/** Beginn des aktuellen Kalendertags in Europe/Berlin als ISO-Zeitpunkt. */
export function berlinStartOfDay(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "longOffset",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const zone = get("timeZoneName").replace("GMT", "");
  const match = zone.match(/^([+-])(\d{2}):(\d{2})$/);
  const offsetMinutes = match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  const localMidnightAsUtc = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  return new Date(localMidnightAsUtc - offsetMinutes * 60000).toISOString();
}
