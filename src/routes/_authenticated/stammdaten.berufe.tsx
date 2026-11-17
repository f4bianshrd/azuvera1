import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useProfessions } from "@/features/app/queries";

const TITLE = "Berufe – Azuvera";

export const Route = createFileRoute("/_authenticated/stammdaten/berufe")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Ausbildungsberufe verwalten." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Ausbildungsberufe verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BerufePage,
});

interface ProfForm {
  id?: string;
  name: string;
  chamber: string;
  description: string;
  code: string;
  duration_months: string;
  ai_hints: string;
}

const emptyForm: ProfForm = { name: "", chamber: "", description: "", code: "", duration_months: "36", ai_hints: "" };

function BerufePage() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();
  const { data: professions, isLoading } = useProfessions();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProfForm>(emptyForm);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLeitung = !!me?.is_team;

  if (me && !isLeitung) {
    return (
      <EmptyState icon={ShieldAlert} title="Kein Zugriff" description="Die Berufsverwaltung steht nur der Ausbildungsleitung zur Verfügung." />
    );
  }

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: NonNullable<typeof professions>[number]) => {
    setForm({
      id: p.id,
      name: p.name,
      chamber: p.chamber ?? "",
      description: p.description ?? "",
      code: p.code ?? "",
      duration_months: String(p.duration_months ?? 36),
      ai_hints: p.ai_hints ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Bitte eine Bezeichnung angeben.");
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      chamber: form.chamber || null,
      description: form.description || null,
      code: form.code || null,
      duration_months: Number(form.duration_months) || 36,
      ai_hints: form.ai_hints,
    };
    const { error } = form.id
      ? await supabase.from("professions").update(payload).eq("id", form.id)
      : await supabase.from("professions").insert(payload);
    setBusy(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen. Bezeichnung und Kürzel müssen eindeutig sein.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["professions"] });
    toast.success(form.id ? "Beruf gespeichert" : "Beruf angelegt");
    setOpen(false);
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("professions").delete().eq("id", deleting);
    if (error) {
      toast.error("Löschen fehlgeschlagen.");
      return;
    }
    toast.success("Beruf gelöscht");
    setDeleting(null);
    await queryClient.invalidateQueries({ queryKey: ["professions"] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ausbildungsberufe"
        subtitle="Berufe anlegen und pflegen."
        actions={
          <Button className="h-11" onClick={openCreate}>
            <Plus className="size-4" aria-hidden /> Beruf anlegen
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton />
      ) : (professions ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Noch keine Berufe angelegt."
          description="Lege den ersten Ausbildungsberuf an, damit Azubis ihn wählen können."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> Beruf anlegen
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(professions ?? []).map((p) => (
            <li key={p.id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[p.code, p.chamber, `${p.duration_months ?? 36} Monate`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openEdit(p)} aria-label={`${p.name} bearbeiten`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setDeleting(p.id)} aria-label={`${p.name} löschen`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {p.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog open={open} onOpenChange={setOpen} title={form.id ? "Beruf bearbeiten" : "Beruf anlegen"}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Bezeichnung *</Label>
            <Input id="p-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 text-base" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-chamber">Kammer</Label>
              <Input id="p-chamber" value={form.chamber} onChange={(e) => setForm((f) => ({ ...f, chamber: e.target.value }))} placeholder="IHK / HWK / LWK" className="h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-code">Kürzel</Label>
              <Input id="p-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="z. B. landwirt" className="h-11 text-base" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-duration">Dauer in Monaten</Label>
            <Input id="p-duration" type="number" min={1} max={120} value={form.duration_months} onChange={(e) => setForm((f) => ({ ...f, duration_months: e.target.value }))} className="h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Beschreibung</Label>
            <Textarea id="p-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-ai-hints">KI-Hinweise (Fachsprache)</Label>
            <Textarea id="p-ai-hints" rows={4} maxLength={4000} value={form.ai_hints} onChange={(e) => setForm((f) => ({ ...f, ai_hints: e.target.value }))} className="text-base" />
            <p className="text-xs text-muted-foreground">Wird dem KI-Text als Fachwissen mitgegeben. Nur allgemein gültige Fachbegriffe, keine Betriebsdaten.</p>
          </div>
          <Button className="h-11 w-full" onClick={() => void save()} disabled={busy}>
            Speichern
          </Button>
        </div>
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Beruf löschen?"
        description="Der Beruf wird endgültig gelöscht."
        confirmLabel="Löschen"
        destructive
        onConfirm={() => void remove()}
      />
    </div>
  );
}
