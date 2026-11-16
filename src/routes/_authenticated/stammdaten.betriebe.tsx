import { listBundeslaender } from "@/features/experience/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useCompanies, useProfessions } from "@/features/app/queries";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

const TITLE = "Betriebe – Azuvera";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export const Route = createFileRoute("/_authenticated/stammdaten/betriebe")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Ausbildungsbetriebe verwalten." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Ausbildungsbetriebe verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BetriebePage,
});

const emptyForm = {
  name: "",
  legal_form: "",
  address: "",
  contact_person: "",
  training_number: "",
  chamber: "",
  bundesland: "",
  contact_email: "",
  contact_phone: "",
};

function BetriebePage() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();
  const { data: companies, isLoading } = useCompanies();
  const { data: professions } = useProfessions();
  const { data: lands = [] } = useQuery({ queryKey: ["experience", "bundeslaender"], queryFn: listBundeslaender });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [logo, setLogo] = useState<File | null>(null);
  const [profIds, setProfIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const isLeitung = me?.role === "ausbildungsleitung";

  const { data: links } = useQuery({
    queryKey: ["company-professions"],
    enabled: isLeitung,
    queryFn: async () => {
      const { data } = await supabase.from("company_professions").select("company_id, profession_id");
      return data ?? [];
    },
  });

  if (me && !isLeitung) {
    return (
      <EmptyState icon={ShieldAlert} title="Kein Zugriff" description="Die Betriebsverwaltung steht nur der Ausbildungsleitung zur Verfügung." />
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setProfIds([]);
    setLogo(null);
    setOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name,
      legal_form: c.legal_form ?? "",
      address: c.address ?? "",
      contact_person: c.contact_person ?? "",
      training_number: c.training_number ?? "",
      chamber: c.chamber ?? "",
      bundesland: c.bundesland ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
    });
    setProfIds((links ?? []).filter((l) => l.company_id === c.id).map((l) => l.profession_id));
    setLogo(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Bitte einen Namen angeben.");
      return;
    }
    setBusy(true);
    try {
      let logoUrl = editing?.logo_url ?? null;
      if (logo) {
        if (logo.size > 400 * 1024) throw new Error("Das Logo darf höchstens 400 KB groß sein.");
        const path = `${editing?.id ?? crypto.randomUUID()}/${logo.name}`;
        const { error: upErr } = await supabase.storage.from("company-logos").upload(path, logo, { upsert: true });
        if (upErr) throw upErr;
        logoUrl = path;
      }
      const payload = {
        name: form.name.trim(),
        legal_form: form.legal_form || null,
        address: form.address || null,
        contact_person: form.contact_person || null,
        training_number: form.training_number || null,
        chamber: form.chamber || null,
        bundesland: form.bundesland || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        logo_url: logoUrl,
      };
      let companyId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("companies").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("companies").insert(payload).select("id").single();
        if (error) throw error;
        companyId = data.id;
      }
      if (companyId) {
        await supabase.from("company_professions").delete().eq("company_id", companyId);
        if (profIds.length > 0) {
          const { error } = await supabase
            .from("company_professions")
            .insert(profIds.map((pid) => ({ company_id: companyId!, profession_id: pid })));
          if (error) throw error;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["company-professions"] });
      toast.success(editing ? "Betrieb gespeichert" : "Betrieb angelegt");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("companies").delete().eq("id", deleting.id);
    if (error) {
      toast.error("Löschen fehlgeschlagen.");
      return;
    }
    toast.success("Betrieb gelöscht");
    setDeleting(null);
    await queryClient.invalidateQueries({ queryKey: ["companies"] });
  };

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Betriebe"
        subtitle="Ausbildungsbetriebe anlegen und pflegen."
        actions={
          <Button className="h-11" onClick={openCreate}>
            <Plus className="size-4" aria-hidden /> Betrieb anlegen
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton />
      ) : (companies ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Noch keine Betriebe angelegt."
          description="Lege den ersten Ausbildungsbetrieb an, um ihn Azubis zuzuweisen."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden /> Betrieb anlegen
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(companies ?? []).map((c) => (
            <li key={c.id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[c.legal_form, c.chamber].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Bundesland: {lands.find((l) => l.code === c.bundesland)?.name ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openEdit(c)} aria-label={`${c.name} bearbeiten`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setDeleting(c)} aria-label={`${c.name} löschen`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {c.address && <p className="mt-2 text-sm text-muted-foreground">{c.address}</p>}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Betrieb bearbeiten" : "Betrieb anlegen"}
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={form.name} onChange={set("name")} className="h-11 text-base" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-legal">Rechtsform</Label>
              <Input id="c-legal" value={form.legal_form} onChange={set("legal_form")} className="h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-chamber">Kammer</Label>
              <Input id="c-chamber" value={form.chamber} onChange={set("chamber")} placeholder="IHK / HWK / LWK" className="h-11 text-base" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-bundesland">Bundesland</Label>
            <Select value={form.bundesland || "none"} onValueChange={(v) => setForm((f) => ({ ...f, bundesland: v === "none" ? "" : v }))}>
              <SelectTrigger id="c-bundesland" className="h-11" aria-describedby="c-bundesland-hint"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nicht festgelegt</SelectItem>{lands.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <p id="c-bundesland-hint" className="text-xs text-muted-foreground">Das Bundesland des Betriebs bestimmt, welche Vorgaben für Erfahrungsberichte gelten.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-address">Anschrift</Label>
            <Input id="c-address" value={form.address} onChange={set("address")} className="h-11 text-base" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-contact">Ansprechpartner:in</Label>
              <Input id="c-contact" value={form.contact_person} onChange={set("contact_person")} className="h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-training">Ausbildungsnummer</Label>
              <Input id="c-training" value={form.training_number} onChange={set("training_number")} className="h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Kontakt-E-Mail</Label>
              <Input id="c-email" type="email" value={form.contact_email} onChange={set("contact_email")} className="h-11 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Telefon</Label>
              <Input id="c-phone" type="tel" value={form.contact_phone} onChange={set("contact_phone")} className="h-11 text-base" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-logo">Logo (PNG/JPG bis 400 KB)</Label>
            <Input
              id="c-logo"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>Zugeordnete Berufe</Label>
            {(professions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Noch keine Berufe angelegt.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3">
                {(professions ?? []).map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={profIds.includes(p.id)}
                        onCheckedChange={(v) =>
                          setProfIds((cur) => (v === true ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
                        }
                      />
                      {p.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button className="h-11 w-full" onClick={() => void save()} disabled={busy}>
            Speichern
          </Button>
        </div>
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Betrieb löschen?"
        description={deleting ? `„${deleting.name}“ wird endgültig gelöscht.` : undefined}
        confirmLabel="Löschen"
        destructive
        onConfirm={() => void remove()}
      />
    </div>
  );
}
