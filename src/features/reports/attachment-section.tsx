import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Camera, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Clock } from "lucide-react";
import {
  addAttachment,
  attachmentUrl,
  deleteAttachment,
  openAttachmentExternally,
  updateAttachment,
  type Report,
  type ReportAttachment,
} from "./api";
import { MAX_ATTACHMENTS, processFile, sanitizeFileName, UserFacingError } from "./attachments";
import { isQuotaError, QUOTA_MESSAGE } from "@/lib/sync/db";

/** Nur eigene, verständliche Meldungen anzeigen – technische Fehlertexte nie. */
function uploadErrorMessage(e: unknown): string {
  if (isQuotaError(e)) return QUOTA_MESSAGE;
  if (e instanceof UserFacingError) return e.message;
  return "Die Datei konnte auf diesem Gerät nicht gespeichert werden. Bitte versuche es erneut oder starte die App neu.";
}

/** Gemeinsame Felder von Berichts- und Erfahrungsberichts-Anhängen. */
export interface AttachmentLike {
  id: string; file_name: string; mime_type: string; caption: string | null; sort_order: number;
  storage_path: string; thumb_path: string | null; _sync?: string | undefined; _base_version?: number | null | undefined;
}
/** Datenzugriff je Modul (Berichte bzw. Erfahrungsberichte) – die Oberfläche bleibt dieselbe. */
export interface AttachmentAdapter {
  queryKey: unknown[];
  limitMessage: string;
  add: (input: Parameters<typeof addAttachment>[0]) => Promise<void>;
  update: (id: string, patch: { caption?: string; sort_order?: number }) => Promise<void>;
  remove: (a: AttachmentLike) => Promise<void>;
  url: (a: AttachmentLike, kind: "thumb" | "original") => Promise<string>;
  openExternal: (a: AttachmentLike) => Promise<void>;
}

interface PendingUpload {
  key: string;
  name: string;
  progress: "uploading" | "error";
}

export function AttachmentSection({
  report,
  attachments,
  editable,
  adapter,
}: {
  report: Pick<Report, "id" | "azubi_id">;
  attachments: AttachmentLike[];
  editable: boolean;
  adapter?: AttachmentAdapter;
}) {
  const queryClient = useQueryClient();
  const api: AttachmentAdapter = adapter ?? {
    queryKey: ["reports", report.id],
    limitMessage: "Höchstens 10 Anhänge je Bericht.",
    add: addAttachment,
    update: updateAttachment,
    remove: (a) => deleteAttachment(a as ReportAttachment),
    url: (a, kind) => attachmentUrl(a as ReportAttachment, kind),
    openExternal: (a) => openAttachmentExternally(a as ReportAttachment),
  };
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [viewer, setViewer] = useState<{ index: number; url: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: api.queryKey });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      if (list.length === 0) return;
      if (attachments.length + pending.length + list.length > MAX_ATTACHMENTS) {
        toast.error(api.limitMessage);
        return;
      }
      for (const file of list) {
        const key = crypto.randomUUID();
        setPending((p) => [...p, { key, name: file.name, progress: "uploading" }]);
        try {
          const processed = await processFile(file);
          await api.add({
            report,
            blob: processed.blob,
            thumb: processed.thumb ?? undefined,
            fileName: sanitizeFileName(file.name),
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            sha256: processed.sha256,
            sortOrder: attachments.length,
          });
          setPending((p) => p.filter((x) => x.key !== key));
          await invalidate();
        } catch (e) {
          console.error(e);
          setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: "error" as const } : x)));
          toast.error(uploadErrorMessage(e));
        }
      }
    },
    [attachments.length, pending.length, report.azubi_id, report.id],
  );

  const retry = (item: PendingUpload) => {
    setPending((p) => p.filter((x) => x.key !== item.key));
    fileRef.current?.click();
  };

  const remove = async (a: AttachmentLike) => {
    try {
      await api.remove(a);
      await invalidate();
      toast.success("Anhang gelöscht");
    } catch {
      toast.error("Löschen fehlgeschlagen.");
    }
  };

  const move = async (a: AttachmentLike, dir: -1 | 1) => {
    const idx = attachments.findIndex((x) => x.id === a.id);
    const swap = attachments[idx + dir];
    if (!swap) return;
    try {
      await api.update(a.id, { sort_order: swap.sort_order });
      await api.update(swap.id, { sort_order: a.sort_order });
      await invalidate();
    } catch {
      toast.error("Reihenfolge konnte nicht geändert werden.");
    }
  };

  const openViewer = async (a: AttachmentLike, index: number) => {
    try {
      if (a.mime_type === "application/pdf") {
        await api.openExternal(a);
      } else {
        const url = await api.url(a, "original");
        setViewer({ index, url });
      }
    } catch {
      toast.error("Datei konnte nicht geöffnet werden.");
    }
  };

  const thumbUrl = async (a: AttachmentLike): Promise<string> => api.url(a, "thumb");

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Anhänge</h2>

      {editable && (
        <>
          <div
            className={cn(
              "hidden rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground sm:block",
              dragOver && "border-primary bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
          >
            Dateien hierher ziehen oder
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" aria-hidden /> Foto aufnehmen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => galleryRef.current?.click()}>
              <ImageIcon className="size-4" aria-hidden /> Aus Galerie wählen
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" aria-hidden /> Datei wählen (PDF)
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">
            Lade nur Material hoch, das du zeigen darfst – keine Gesichter ohne Einverständnis, keine Kundendaten.
          </p>
        </>
      )}

      {pending.map((p) => (
        <div key={p.key} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
          {p.progress === "uploading" ? (
            <>
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-muted-foreground">Lädt…</span>
            </>
          ) : (
            <>
              <span className="flex-1 truncate text-destructive">{p.name} – fehlgeschlagen</span>
              <Button type="button" variant="outline" size="sm" onClick={() => retry(p)}>
                Erneut versuchen
              </Button>
            </>
          )}
        </div>
      ))}

      {attachments.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((a, i) => (
            <li key={a.id} className="group relative overflow-hidden rounded-xl border bg-muted/30">
              <div className="relative">
              <button
                type="button"
                className="block aspect-square w-full"
                onClick={() => void openViewer(a, i)}
                aria-label={a.file_name}
              >
                {a.mime_type === "application/pdf" ? (
                  <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <FileText className="size-8" aria-hidden />
                    <span className="px-2 text-center text-xs break-all">{a.file_name}</span>
                  </span>
                ) : (
                  <AttachmentThumb attachment={a} loadUrl={thumbUrl} />
                )}
              </button>
              {editable && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 p-1">
                  <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => void move(a, -1)} aria-label="Nach vorne">
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => void remove(a)} aria-label="Löschen">
                    <Trash2 className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" disabled={i === attachments.length - 1} onClick={() => void move(a, 1)} aria-label="Nach hinten">
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              )}
              </div>
              {editable && (
                <div className="p-1.5">
                  <Input
                    defaultValue={a.caption ?? ""}
                    placeholder="Bildunterschrift (optional)"
                    maxLength={200}
                    className="h-8 text-xs"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (a.caption ?? "")) void api.update(a.id, { caption: v }).then(invalidate);
                    }}
                  />
                </div>
              )}
              {a._sync === "pending" && a._base_version === null && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium">
                  <Clock className="size-3" aria-hidden /> Wartet auf Upload
                </span>
              )}
              {!editable && a.caption && <p className="p-1.5 text-xs text-muted-foreground">{a.caption}</p>}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={viewer !== null} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-4xl p-2">
          {viewer && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={viewer.index === 0}
                onClick={() => {
                  const prev = attachments[viewer.index - 1];
                  if (prev) void openViewer(prev, viewer.index - 1);
                }}
                aria-label="Vorheriges Bild"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <img src={viewer.url} alt="" className="max-h-[80vh] flex-1 object-contain" />
              <Button
                variant="ghost"
                size="icon"
                disabled={viewer.index >= attachments.length - 1}
                onClick={() => {
                  const next = attachments[viewer.index + 1];
                  if (next) void openViewer(next, viewer.index + 1);
                }}
                aria-label="Nächstes Bild"
              >
                <ArrowRight className="size-5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AttachmentThumb({
  attachment,
  loadUrl,
}: {
  attachment: AttachmentLike;
  loadUrl: (a: AttachmentLike) => Promise<string>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const load = useCallback(() => {
    if (url) return;
    void loadUrl(attachment).then(setUrl).catch(() => undefined);
  }, [attachment, loadUrl, url]);

  return (
    <span
      ref={(el) => {
        ref.current = el;
        if (el && !url) {
          const obs = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
              load();
              obs.disconnect();
            }
          });
          obs.observe(el);
        }
      }}
      className="block h-full w-full"
    >
      {url ? (
        <img src={url} alt={attachment.caption ?? attachment.file_name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </span>
      )}
    </span>
  );
}
