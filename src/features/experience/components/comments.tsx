import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/features/dictation/dictation-button";
import { readPunctuationPreference } from "@/features/dictation/api";
import { ROLE_LABELS } from "@/features/app/session";
import { commentAuthors } from "@/features/review/api";
import { addComment, listComments, subscribeToComments, type Experience, type ExperienceSection } from "../api";

const SECTION_LABELS: Record<string, string> = { body: "Bericht", reasoning: "Begründung" };

export function ExperienceCommentsCard({ report, canComment }: { report: Experience; canComment: boolean }) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<ExperienceSection>("body");
  const [body, setBody] = useState("");
  const [interim, setInterim] = useState("");
  const [punctuation, setPunctuation] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { data: comments } = useQuery({ queryKey: ["experience", "comments", report.id], queryFn: () => listComments(report.id), enabled: report.status !== "draft" });
  const { data: authors } = useQuery({
    queryKey: ["experience", "comment-authors", report.id, (comments ?? []).map((c) => c.author_id).join(",")],
    queryFn: () => commentAuthors((comments ?? []).map((c) => c.author_id)),
    enabled: !!comments?.length,
  });
  useEffect(() => {
    setPunctuation(readPunctuationPreference());
    if (report.status === "draft") return;
    return subscribeToComments(report.id, () => void queryClient.invalidateQueries({ queryKey: ["experience", "comments", report.id] }));
  }, [report.id, report.status, queryClient]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addComment(report.id, section, body);
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["experience", "comments", report.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Kommentar konnte nicht gesendet werden."); }
    finally { setBusy(false); }
  };

  return <section id="kommentare" className="scroll-mt-24 rounded-2xl border bg-card p-4">
    <h2 className="font-semibold">Kommentare</h2>
    {report.status === "draft" ? <p className="mt-2 text-sm text-muted-foreground">Kommentare sind nach dem Einreichen möglich.</p> : <>
      <div className="mt-4 space-y-4">
        {(comments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Kommentare.</p> : (comments ?? []).map((c) => {
          const name = authors?.names.get(c.author_id) || "Unbekannt";
          const role = authors?.roles.get(c.author_id);
          const title = c.kind === "rejection" ? `Korrekturnotiz von ${name}` : c.kind === "approval" ? "Freigegeben" : c.kind === "reopen" ? "Wieder geöffnet" : name;
          return <article key={c.id} className={cn("flex gap-3 rounded-xl border p-3", c.kind === "rejection" && "border-destructive/50 bg-destructive/5")}>
            <Avatar className="size-9 shrink-0"><AvatarFallback className="text-xs">{name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p>
                {role && <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[role]}</Badge>}
                {SECTION_LABELS[c.section] && <Badge variant="outline" className="text-[10px]">{SECTION_LABELS[c.section]}</Badge>}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              <time className="mt-1 block text-xs text-muted-foreground" dateTime={c.created_at} title={format(new Date(c.created_at), "dd.MM.yyyy HH:mm 'Uhr'", { locale: de })}>vor {formatDistanceToNow(new Date(c.created_at), { locale: de })}</time>
            </div>
          </article>;
        })}
      </div>
      {canComment && <div className="mt-5 space-y-3 border-t pt-4">
        <div className="space-y-1.5"><Label htmlFor="exp-comment-section">Bezug</Label>
          <Select value={section} onValueChange={(v) => setSection(v as ExperienceSection)}><SelectTrigger id="exp-comment-section"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="body">Bericht</SelectItem><SelectItem value="reasoning">Begründung</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2"><Label htmlFor="exp-comment">Kommentar schreiben</Label><DictationButton textareaRef={ref} getValue={() => body} onValueChange={setBody} onInterim={setInterim} spokenPunctuation={punctuation} /></div>
          <Textarea id="exp-comment" ref={ref} rows={3} maxLength={2000} placeholder="Kommentar schreiben" value={body} onChange={(e) => setBody(e.target.value)} />
          {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
          <p className="text-right text-xs text-muted-foreground">{body.length} / 2.000</p>
        </div>
        <Button onClick={() => void send()} disabled={!body.trim() || busy}><Send className="size-4" aria-hidden />{busy ? "Sendet…" : "Senden"}</Button>
        <p className="text-xs text-muted-foreground">Kommentare können nicht geändert oder gelöscht werden.</p>
      </div>}
    </>}
  </section>;
}
