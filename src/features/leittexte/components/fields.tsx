import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { processFile, sanitizeFileName, UserFacingError } from "@/features/reports/attachments";
import { isQuotaError, QUOTA_MESSAGE } from "@/lib/sync/db";
import { addImage, deleteImage, imageUrl, type WorkImage } from "../api";
import { normalizeTable, type AnswerValue, type CheckboxValue, type LeittextField, type TableValue } from "../model";

interface FieldProps {
  field: LeittextField;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  editable: boolean;
  /** Für Bildfelder */
  images?: WorkImage[];
  work?: { id: string; azubi_id: string };
  answerKey: string;
  onImagesChanged?: () => void;
}

export function LeittextFieldView(p: FieldProps) {
  const { field } = p;
  if (field.type === "info") return <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm whitespace-pre-line text-muted-foreground">{field.text}</p>;
  return (
    <div className="space-y-1.5">
      {field.label && field.type !== "table" && <p className="text-sm font-medium">{field.label}</p>}
      {field.type === "text" || field.type === "number" ? <TextField {...p} /> : null}
      {field.type === "longtext" ? <LongText {...p} /> : null}
      {field.type === "table" ? <TableField {...p} /> : null}
      {field.type === "checkbox" ? <CheckboxField {...p} /> : null}
      {field.type === "image" ? <ImageField {...p} /> : null}
    </div>
  );
}

const Empty = () => <p className="text-sm italic text-muted-foreground">Nicht ausgefüllt</p>;

function TextField({ field, value, onChange, editable, answerKey }: FieldProps) {
  const v = typeof value === "string" ? value : "";
  if (!editable) return v.trim() ? <p className="text-sm">{v}{field.unit ? ` ${field.unit}` : ""}</p> : <Empty />;
  return (
    <div className="flex items-center gap-2">
      <Input id={answerKey} value={v} inputMode={field.type === "number" ? "decimal" : undefined} onChange={(e) => onChange(e.target.value)}
        aria-label={field.label ?? "Antwort"} className={field.unit ? "max-w-48" : ""} maxLength={500} />
      {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
    </div>
  );
}

function LongText({ field, value, onChange, editable, answerKey }: FieldProps) {
  const v = typeof value === "string" ? value : "";
  if (!editable) return v.trim() ? <p className="text-sm whitespace-pre-line leading-relaxed">{v}</p> : <Empty />;
  const rows = Math.min(10, Math.max(3, field.lines ?? 4));
  return <Textarea id={answerKey} value={v} rows={rows} maxLength={8000} onChange={(e) => onChange(e.target.value)} aria-label={field.label ?? "Antwort"} placeholder="Deine Antwort …" />;
}

function TableField({ field, value, onChange, editable }: FieldProps) {
  const table = normalizeTable(field, value);
  const fixed = !!field.rows;
  const heads = field.columns ?? [];
  const valueHeads = fixed ? heads.slice(1) : heads;
  const set = (r: number, c: number, text: string) => {
    const next: TableValue = table.map((row) => [...row]);
    next[r]![c] = text;
    onChange(next);
  };
  const hasAny = table.some((row) => row.some((c) => c.trim()));
  if (!editable && !hasAny) return <Empty />;
  return (
    <div className="space-y-2">
      {field.label && <p className="text-sm font-medium">{field.label}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[28rem] text-sm">
          {heads.length > 0 && (
            <thead className="bg-muted/60">
              <tr>{heads.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {table.map((row, r) => (
              <tr key={r} className="border-t">
                {fixed && <th scope="row" className="px-2 py-1.5 text-left font-normal text-muted-foreground">{field.rows![r]}</th>}
                {row.map((cell, c) => (
                  <td key={c} className="px-1 py-1">
                    {editable ? (
                      <Input value={cell} onChange={(e) => set(r, c, e.target.value)} className="h-9" maxLength={300}
                        aria-label={`${fixed ? field.rows![r] : `Zeile ${r + 1}`}${valueHeads[c] ? `, ${valueHeads[c]}` : ""}`} />
                    ) : <span className="block px-1 py-1">{cell}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && !fixed && table.length < 40 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...table, Array.from({ length: table[0]?.length ?? 1 }, () => "")])}>
          <Plus className="size-4" aria-hidden /> Zeile hinzufügen
        </Button>
      )}
    </div>
  );
}

function CheckboxField({ field, value, onChange, editable, answerKey }: FieldProps) {
  const v: CheckboxValue = value && typeof value === "object" && !Array.isArray(value) ? value : { selected: [] };
  const toggle = (o: string, on: boolean) => onChange({ ...v, selected: on ? [...v.selected, o] : v.selected.filter((x) => x !== o) });
  if (!editable) {
    const items = [...v.selected, ...(v.other?.trim() ? [v.other.trim()] : [])];
    return items.length ? (
      <ul className="flex flex-wrap gap-1.5">{items.map((i) => <li key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm text-primary"><Check className="size-3.5" aria-hidden />{i}</li>)}</ul>
    ) : <Empty />;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(field.options ?? []).map((o, i) => (
        <label key={o} htmlFor={`${answerKey}-${i}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
          <Checkbox id={`${answerKey}-${i}`} checked={v.selected.includes(o)} onCheckedChange={(c) => toggle(o, c === true)} />
          {o}
        </label>
      ))}
      {field.other && <Input value={v.other ?? ""} onChange={(e) => onChange({ ...v, other: e.target.value })} placeholder="Sonstiges …" aria-label="Sonstiges" className="sm:col-span-2" maxLength={300} />}
    </div>
  );
}

function Thumb({ img, onOpen }: { img: WorkImage; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; let made: string | null = null;
    imageUrl(img, "thumb").then((u) => { if (alive) { made = u; setUrl(u); } }).catch(() => {});
    return () => { alive = false; if (made?.startsWith("blob:")) URL.revokeObjectURL(made); };
  }, [img]);
  return (
    <button type="button" onClick={async () => onOpen(await imageUrl(img, "original"))} className="block size-24 overflow-hidden rounded-lg border bg-muted sm:size-28" aria-label={`Bild ${img.file_name} groß anzeigen`}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" aria-hidden />}
    </button>
  );
}

function ImageField({ images = [], editable, work, answerKey, onImagesChanged }: FieldProps) {
  const own = images.filter((i) => i.field_key === answerKey);
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !work) return;
    setBusy(true);
    try {
      let order = own.length;
      for (const f of Array.from(files).slice(0, 6)) {
        const processed = await processFile(f);
        await addImage(work, answerKey, processed, sanitizeFileName(f.name || "foto.jpg"), order++);
      }
      onImagesChanged?.();
    } catch (e) {
      toast.error(isQuotaError(e) ? QUOTA_MESSAGE : e instanceof UserFacingError || e instanceof Error ? e.message : "Das Bild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  };
  if (!editable && own.length === 0) return <Empty />;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {own.map((img) => (
          <div key={img.id} className="relative">
            <Thumb img={img} onOpen={setBig} />
            {editable && (
              <Button type="button" size="icon" variant="secondary" className="absolute -right-2 -top-2 size-8 rounded-full shadow" aria-label="Bild entfernen"
                onClick={async () => { await deleteImage(img); onImagesChanged?.(); }}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => camRef.current?.click()}><Camera className="size-4" aria-hidden /> Foto aufnehmen</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => galRef.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />} Bild oder Skizze wählen
          </Button>
        </div>
      )}
      <Dialog open={!!big} onOpenChange={(o) => !o && setBig(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Bild</DialogTitle>
          {big && <img src={big} alt="" className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
