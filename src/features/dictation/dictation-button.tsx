import { useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activeConsent, listMyConsents } from "@/features/consents/api";
import { ConsentDialog } from "@/features/consents/consent-dialog";
import { DICTATION_OFFLINE, DICTATION_UNSUPPORTED } from "./api";
import { applySpokenPunctuation } from "./punctuation";
import { useDictation } from "./use-dictation";

const FIELD_LIMIT = 20000;

export function DictationButton({
  textareaRef,
  getValue,
  onValueChange,
  onInterim,
  spokenPunctuation,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  getValue: () => string;
  onValueChange: (value: string) => void;
  onInterim: (text: string) => void;
  spokenPunctuation: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: consents } = useQuery({ queryKey: ["consents"], queryFn: listMyConsents });
  const [consentOpen, setConsentOpen] = useState(false);
  const insertAtRef = useRef(0);
  const punctuationRef = useRef(spokenPunctuation);
  punctuationRef.current = spokenPunctuation;

  const insertFinal = (raw: string) => {
    const current = getValue();
    const position = Math.min(insertAtRef.current, current.length);
    const before = current.slice(0, position);
    const after = current.slice(position);
    let insertion = punctuationRef.current ? applySpokenPunctuation(raw, before) : raw.trim();
    if (before && !/\s$/.test(before) && !/^[.,!?;:\n]/.test(insertion)) insertion = ` ${insertion}`;
    if (after && !/^\s/.test(after) && !/\s$/.test(insertion)) insertion = `${insertion} `;
    const next = before + insertion + after;
    if (next.length > FIELD_LIMIT) {
      onValueChange(next.slice(0, FIELD_LIMIT));
      insertAtRef.current = Math.min(before.length + insertion.length, FIELD_LIMIT);
      toast.error("Das Feld ist voll.");
      return;
    }
    insertAtRef.current = before.length + insertion.length;
    onValueChange(next);
  };

  const dictation = useDictation({ onFinal: insertFinal, onInterim });

  const start = () => {
    if (!activeConsent(consents, "dictation")) {
      setConsentOpen(true);
      return;
    }
    insertAtRef.current = textareaRef.current?.selectionStart ?? getValue().length;
    dictation.start();
  };

  const reason = !dictation.supported ? DICTATION_UNSUPPORTED : !dictation.online ? DICTATION_OFFLINE : undefined;
  const disabled = !!reason;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant={dictation.listening ? "destructive" : "ghost"}
        size="sm"
        disabled={disabled}
        title={reason ?? (dictation.listening ? "Diktat stoppen" : "Diktat starten")}
        aria-pressed={dictation.listening}
        onClick={dictation.listening ? dictation.stop : start}
      >
        {dictation.listening ? <Square className="size-4 fill-current" aria-hidden /> : <Mic className="size-4" aria-hidden />}
        {dictation.listening && <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" aria-hidden />}
        {dictation.listening ? "Stopp" : "Diktat"}
      </Button>
      {dictation.listening && (
        <span className="text-xs text-muted-foreground tabular-nums" aria-label="Aufnahmedauer">
          {String(Math.floor(dictation.seconds / 60)).padStart(2, "0")}:{String(dictation.seconds % 60).padStart(2, "0")}
        </span>
      )}
      {reason && <span className="basis-full text-xs text-muted-foreground">{reason}</span>}
      <span className="sr-only" aria-live="polite">{dictation.announcement}</span>
      <ConsentDialog
        kind="dictation"
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onGranted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["consents"] });
          insertAtRef.current = textareaRef.current?.selectionStart ?? getValue().length;
          dictation.start();
        }}
      />
    </span>
  );
}
