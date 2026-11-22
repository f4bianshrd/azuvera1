import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/dialogs";
import { ListSkeleton } from "@/components/shared";
import { ROLE_LABELS, type MyProfile } from "@/features/app/session";
import { adminAddSupportAgent, adminListSupportAgents, adminRemoveSupportAgent, type SupportAgent } from "../api";

/** Verwaltung → Support-Konten: nur Inhaber:in des Teams bzw. Ausbildungsleitung vergibt IT/Technik. */
export function SupportAccountsCard({ me }: { me: MyProfile }) {
  const client = useQueryClient();
  const agents = useQuery({ queryKey: ["admin-support-agents"], queryFn: adminListSupportAgents });
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"add" | SupportAgent | null>(null);
  const canManage = !!me.is_team_owner || me.role === "ausbildungsleitung";
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["admin-support-agents"] }), client.invalidateQueries({ queryKey: ["admin-users"] })]);
  const add = useMutation({ mutationFn: adminAddSupportAgent, onSuccess: async () => { setEmail(""); toast.success("Support-Konto angelegt"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: adminRemoveSupportAgent, onSuccess: async () => { toast.success("Support-Rolle entfernt"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <section id="support-konten" className="scroll-mt-20 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><LifeBuoy className="size-5 text-primary" aria-hidden />Support-Konten (IT/Technik)</h2>
      <p className="mt-2 text-sm text-muted-foreground">IT/Technik sieht Daten einer Person erst nach einem eingelösten Ticket-Code oder einer bestandenen Identitätsprüfung. Die Zwei-Faktor-Anmeldung ist Pflicht und wird beim ersten Öffnen des Support-Bereichs eingerichtet.</p>
      <div className="mt-4">
        {agents.isLoading || !agents.data ? <ListSkeleton rows={1} /> : agents.data.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Support-Konten.</p> : (
          <ul className="divide-y">
            {agents.data.map((a) => (
              <li key={a.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.full_name || "—"}</p>
                    <Badge variant={a.has_mfa ? "default" : "destructive"}>{a.has_mfa ? "2-Faktor aktiv" : "2-Faktor fehlt"}</Badge>
                  </div>
                  <p className="break-all text-sm text-muted-foreground">{a.email} · vorher {ROLE_LABELS[a.previous_role]}</p>
                </div>
                {canManage && <Button variant="outline" size="sm" className="min-h-10" onClick={() => setPending(a)}>Rolle entfernen</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canManage && (
        <form className="mt-4 space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (email.trim()) setPending("add"); }}>
          <Label htmlFor="support-email">E-Mail-Adresse eines bestätigten Kontos</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="support-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base sm:max-w-sm" />
            <Button type="submit" className="h-11" disabled={add.isPending || !email.trim()}>Zu IT/Technik machen</Button>
          </div>
        </form>
      )}
      <ConfirmDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}
        title={pending === "add" ? "Zu IT/Technik machen?" : "Support-Rolle entfernen?"}
        confirmLabel={pending === "add" ? "Ja, umstellen" : "Entfernen"}
        description={pending === "add" ? "Die Person verliert ihre bisherige Rolle und alle Zugriffe auf Berichtshefte. Sie kann keine Rollen ändern und gehört nicht zur Verwaltung." : "Laufende Support-Sitzungen enden sofort; die Person erhält ihre vorherige Rolle zurück."}
        onConfirm={() => { if (pending === "add") add.mutate(email); else if (pending) remove.mutate(pending.user_id); setPending(null); }} />
    </section>
  );
}
