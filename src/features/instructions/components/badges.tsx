import { AlertTriangle, CheckCircle2, CircleDashed, Clock, FileEdit, Send, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DueState, TopicStatus } from "../due";
import { RECORD_STATUS_DE, stateLabel } from "../model";

const REC: Record<string, { icon: LucideIcon; cls: string }> = {
  draft: { icon: FileEdit, cls: "bg-muted text-muted-foreground border-border" },
  submitted: { icon: Send, cls: "bg-primary/10 text-primary border-primary/30" },
  confirmed: { icon: CheckCircle2, cls: "bg-success/15 text-foreground border-success/40" },
  rejected: { icon: XCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function RecordStatusBadge({ status }: { status: string }) {
  const s = REC[status] ?? REC["draft"]!;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      <s.icon className="size-3.5" aria-hidden />{RECORD_STATUS_DE[status] ?? status}
    </span>
  );
}

const DUE: Record<DueState, { icon: LucideIcon; cls: string }> = {
  valid: { icon: ShieldCheck, cls: "bg-success/15 text-foreground border-success/40" },
  due_soon: { icon: Clock, cls: "bg-warning/20 text-foreground border-warning/50" },
  overdue: { icon: AlertTriangle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
  open: { icon: CircleDashed, cls: "bg-primary/10 text-primary border-primary/30" },
  optional: { icon: CircleDashed, cls: "bg-muted text-muted-foreground border-border" },
};

export function DueBadge({ status }: { status: Pick<TopicStatus, "state" | "due_on"> }) {
  const s = DUE[status.state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      <s.icon className="size-3.5" aria-hidden />{stateLabel(status)}
    </span>
  );
}
