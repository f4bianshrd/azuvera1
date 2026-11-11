import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { SignaturePad } from "@/features/reports/signature-pad";
import { REVIEWER_ROLES, useMyProfile } from "@/features/app/session";
import { deleteSavedSignature, getSavedSignature, savedSignatureUrl, saveDrawnSignature } from "./api";

export function SavedSignatureCard() {
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();
  const [drawOpen, setDrawOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [valid, setValid] = useState(false);
  const [png, setPng] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: saved } = useQuery({ queryKey: ["review", "saved-signature"], queryFn: getSavedSignature, enabled: !!profile && REVIEWER_ROLES.includes(profile.role) });
  const { data: url } = useQuery({ queryKey: ["review", "saved-signature-url", saved?.image_path], queryFn: () => savedSignatureUrl(saved!.image_path), enabled: !!saved });
  if (!profile || !REVIEWER_ROLES.includes(profile.role)) return null;

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["review", "saved-signature"] }),
    queryClient.invalidateQueries({ queryKey: ["review", "saved-signature-url"] }),
  ]);
  const save = async () => {
    if (!valid || !png) return;
    setBusy(true);
    try {
      await saveDrawnSignature(profile.id, png);
      await refresh();
      setDrawOpen(false);
      toast.success("Unterschrift gespeichert");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try {
      await deleteSavedSignature();
      await refresh();
      toast.success("Unterschrift gelöscht");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Löschen fehlgeschlagen."); }
  };

  return <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
    <h2 className="text-lg font-semibold">Meine Unterschrift</h2>
    <div className="mt-4 rounded-xl border bg-signature-paper p-4">{saved ? <div className="flex min-h-28 items-center justify-center">{url && <img src={url} alt="Gespeicherte Unterschrift" className="h-28 object-contain" />}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Unterschrift gespeichert.</p>}</div>
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDrawOpen(true)}>Neu zeichnen</Button>{saved && <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>Löschen</Button>}</div>
    <p className="mt-3 text-xs text-muted-foreground">Du kannst deine gespeicherte Unterschrift bei der Freigabe mit einem Klick verwenden. Sie wird immer gemeinsam mit Zeitpunkt und Prüfsumme festgehalten.</p>
    <ResponsiveDialog open={drawOpen} onOpenChange={setDrawOpen} title="Unterschrift neu zeichnen"><div className="space-y-4"><SignaturePad onChange={(isValid, blob) => { setValid(isValid); setPng(blob); }} /><Button className="w-full" disabled={!valid || busy} onClick={() => void save()}>{busy ? "Speichert…" : "Speichern"}</Button></div></ResponsiveDialog>
    <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Unterschrift löschen?" description="Die gespeicherte Unterschrift wird entfernt. Frühere Unterschriften in Berichten bleiben erhalten." confirmLabel="Löschen" destructive onConfirm={() => void remove()} />
  </section>;
}
