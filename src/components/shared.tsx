import type { ReactNode } from "react";
import { CheckCircle2, FileEdit, Send, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import iconUrl from "@/assets/azuvera-icon.png";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src={iconUrl} alt="" width={size} height={size} className="rounded-lg" />
      <span className="text-lg font-bold tracking-tight text-foreground">Azuvera</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint }: { label: string; value: ReactNode; icon?: LucideIcon; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-5 text-primary" aria-hidden />}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export type ReportStatus = "draft" | "submitted" | "approved" | "rejected";
const statusMap: Record<ReportStatus, { label: string; icon: LucideIcon; cls: string }> = {
  draft: { label: "Entwurf", icon: FileEdit, cls: "bg-muted text-muted-foreground border-border" },
  submitted: { label: "Eingereicht", icon: Send, cls: "bg-primary/10 text-primary border-primary/30" },
  approved: { label: "Freigegeben", icon: CheckCircle2, cls: "bg-success/15 text-foreground border-success/40" },
  rejected: { label: "Zurückgewiesen", icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const s = statusMap[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      <s.icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed p-10 text-center">
      {Icon && <Icon className="mb-3 size-10 text-muted-foreground" aria-hidden />}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-8 w-1/2" />
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
