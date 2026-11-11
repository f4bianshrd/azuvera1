import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { ROLE_LABELS } from "@/features/app/session";
import type { Report } from "@/features/reports/api";
import { cn } from "@/lib/utils";
import { addComment, commentAuthors, listComments, subscribeToComments, type CommentSection } from "./api";

export const COMMENT_SECTIONS: { value: CommentSection; label: string }[] = [
  { value: "activities", label: "Tätigkeiten" },
  { value: "school_content", label: "Berufsschule" },
  { value: "instructions", label: "Unterweisungen" },
  { value: "summary", label: "Zusammenfassung" },
];

export function commentSectionLabel(section: string | null): string | null {
  return COMMENT_SECTIONS.find((item) => item.value === section)?.label ?? null;
}

export function CommentsCard({ report, canComment, sectionRequest }: {
  report: Report;
  canComment: boolean;
  sectionRequest?: { section: CommentSection; nonce: number } | undefined;
}) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<CommentSection | "all">("all");
  const [body, setBody] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enabled = report.status !== "draft";
  const { data: comments } = useQuery({ queryKey: ["review", "comments", report.id], queryFn: () => listComments(report.id), enabled });
  const { data: authors } = useQuery({
    queryKey: ["review", "comment-authors", report.id, (comments ?? []).map((comment) => comment.author_id).join(",")],
    queryFn: () => commentAuthors((comments ?? []).map((comment) => comment.author_id)),
    enabled: enabled && !!comments,
  });

  useEffect(() => {
    setPunctuation(readPunctuationPreference());
    if (!enabled) return;
    return subscribeToComments(report.id, () => {
      void queryClient.invalidateQueries({ queryKey: ["review", "comments", report.id] });
      void queryClient.invalidateQueries({ queryKey: ["review", "metrics"] });
    });
  }, [report.id, enabled, queryClient]);

  useEffect(() => {
    if (!sectionRequest) return;
    setSection(sectionRequest.section);
    window.setTimeout(() => {
      document.getElementById("kommentare")?.scrollIntoView({ behavior: "smooth", block: "start" });
      textareaRef.current?.focus();
    }, 0);
  }, [sectionRequest]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addComment(report.id, section === "all" ? null : section, body);
      setBody("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["review", "comments", report.id] }),
        queryClient.invalidateQueries({ queryKey: ["review", "metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kommentar konnte nicht gesendet werden."); }
    finally { setBusy(false); }
  };

  return <section id="kommentare" className="scroll-mt-24 rounded-2xl border bg-card p-4">
    <h2 className="font-semibold">Kommentare</h2>
    <div className="mt-4 space-y-4">
      {(comments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Kommentare.</p> : (comments ?? []).map((comment) => {
        const name = authors?.names.get(comment.author_id) || "Unbekannt";
        const role = authors?.roles.get(comment.author_id);
        const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
        const title = comment.kind === "rejection" ? `Korrekturnotiz von ${name}` : comment.kind === "approval" ? "Freigegeben" : comment.kind === "reopen" ? "Wieder geöffnet" : name;
        return <article key={comment.id} className={cn("flex gap-3 rounded-xl border p-3", comment.kind === "rejection" && "border-destructive/50 bg-destructive/5")}>
          <Avatar className="size-9 shrink-0"><AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{title}</p>
              {role && <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[role]}</Badge>}
              {commentSectionLabel(comment.section) && <Badge variant="outline" className="text-[10px]">{commentSectionLabel(comment.section)}</Badge>}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
            <time className="mt-1 block text-xs text-muted-foreground" dateTime={comment.created_at} title={format(new Date(comment.created_at), "dd.MM.yyyy HH:mm 'Uhr'", { locale: de })}>vor {formatDistanceToNow(new Date(comment.created_at), { locale: de })}</time>
          </div>
        </article>;
      })}
    </div>
    {canComment && enabled && <div className="mt-5 space-y-3 border-t pt-4">
      <div className="space-y-1.5"><Label>Zu Abschnitt</Label><Select value={section} onValueChange={(value) => setSection(value as CommentSection | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Ganzer Bericht</SelectItem>{COMMENT_SECTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor="comment-body">Kommentar</Label><DictationButton textareaRef={textareaRef} getValue={() => body} onValueChange={setBody} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
        <Textarea id="comment-body" ref={textareaRef} rows={3} maxLength={2000} placeholder="Kommentar schreiben…" value={body} onChange={(event) => setBody(event.target.value)} />
        {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
        <p className="text-right text-xs text-muted-foreground">{body.length} / 2.000</p>
      </div>
      <Button onClick={() => void send()} disabled={!body.trim() || busy}><Send className="size-4" aria-hidden />{busy ? "Sendet…" : "Senden"}</Button>
      <p className="text-xs text-muted-foreground">Kommentare können nicht geändert oder gelöscht werden.</p>
    </div>}
  </section>;
}
