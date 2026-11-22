import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { ROLE_LABELS, useMyProfile, type AppRole, type MyProfile } from "@/features/app/session";
import { DeletionRequestsCard } from "@/features/account/deletion-requests-card";
import { DeleteAccountDialog, type DeletableUser } from "@/features/account/delete-account-dialog";
import { isClosedAccount } from "@/features/account/rules";
import { SupportAccountsCard } from "@/features/support/components/support-accounts-card";
import {
  adminAddTeamMember, adminListTeam, adminListUsers, adminRemoveTeamMember, adminSetUserRole, adminStats,
  type AdminUser, type TeamMember,
} from "@/features/access/api";
import { OFFLINE_ACTION_HINT, useOnline } from "@/lib/sync/status";

const TITLE = "Verwaltung – Azuvera";
const DESC = "Konten, Rollen und das Azuvera-Team verwalten.";
const ROLE_ORDER: AppRole[] = ["azubi", "ausbilder", "betriebsleiter", "ausbildungsberater", "pruefer", "lehrer", "ausbildungsleitung", "it_technik"];
const CHANGEABLE: AppRole[] = ["ausbilder", "betriebsleiter", "ausbildungsberater", "pruefer", "lehrer"];
const dateDe = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { data: me, isLoading } = useMyProfile();
  const online = useOnline();
  const isTeam = !!me?.is_team;
  const users = useQuery({ queryKey: ["admin-users"], queryFn: adminListUsers, enabled: isTeam && online });
  const team = useQuery({ queryKey: ["admin-team"], queryFn: adminListTeam, enabled: isTeam && online });
  if (isLoading || !me) return <ListSkeleton />;
  if (!isTeam) return <Navigate to="/dashboard" replace />;
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Verwaltung" subtitle="Das Team verwaltet Konten und Einstellungen." />
      {me.role !== "ausbildungsleitung" && (
        <p className="rounded-xl border bg-muted/40 p-3 text-sm">Berichte, Kommentare, Unterschriften und Profildaten der Auszubildenden sind für Team-Mitglieder nicht einsehbar.</p>
      )}
      {!online ? <EmptyState title={OFFLINE_ACTION_HINT} /> : (
        <>
          <StatsCard />
          {users.isLoading || team.isLoading || !users.data || !team.data ? <ListSkeleton rows={5} /> : (
            <>
              <UsersCard users={users.data} team={team.data} me={me} />
              <TeamCard team={team.data} me={me} />
              <SupportAccountsCard me={me} />
              <div id="loeschantraege" className="scroll-mt-20"><DeletionRequestsCard users={users.data} /></div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ id, title, children, action }: { id?: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatsCard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: adminStats });
  if (isLoading || !data) return <ListSkeleton rows={1} />;
  const tile = (label: string, value: number, href?: string) => {
    const inner = <><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></>;
    return href
      ? <a key={label} href={href} className="rounded-xl border p-3 transition-colors hover:bg-muted/50">{inner}</a>
      : <div key={label} className="rounded-xl border p-3">{inner}</div>;
  };
  return (
    <Card title="Kennzahlen">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile("Konten", data.users_total)}
        {tile("Neu in 7 Tagen", data.new_7d)}
        {tile("Neu in 30 Tagen", data.new_30d)}
        {tile("Aktive Zugriffe", data.active_grants)}
        {tile("Offene Einladungen", data.open_invitations)}
        {tile("Offene Löschanträge", data.open_deletion_requests, "#loeschantraege")}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {ROLE_ORDER.map((r) => <Badge key={r} variant="outline" className="gap-1.5">{ROLE_LABELS[r]} <span className="font-semibold tabular-nums">{data.users_by_role?.[r] ?? 0}</span></Badge>)}
      </div>
    </Card>
  );
}

type SortKey = "name" | "email" | "role" | "created";

function UsersCard({ users, team, me }: { users: AdminUser[]; team: TeamMember[]; me: MyProfile }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("alle");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [asc, setAsc] = useState(false);
  const [pending, setPending] = useState<{ user: AdminUser; role: AppRole } | null>(null);
  const [deleting, setDeleting] = useState<DeletableUser | null>(null);
  const ownerId = team.find((t) => t.is_owner)?.user_id;
  const roles = me.role === "ausbildungsleitung" ? [...CHANGEABLE, "ausbildungsleitung" as const] : CHANGEABLE;
  const roleM = useMutation({
    mutationFn: (p: { user: AdminUser; role: AppRole }) => adminSetUserRole(p.user.id, p.role),
    onSuccess: async () => { toast.success("Rolle geändert"); await client.invalidateQueries({ queryKey: ["admin-users"] }); await client.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("de");
    const list = users.filter((u) => (roleFilter === "alle" || u.role === roleFilter)
      && (!q || u.full_name.toLocaleLowerCase("de").includes(q) || u.email.toLocaleLowerCase("de").includes(q) || (u.organization ?? "").toLocaleLowerCase("de").includes(q)));
    const val = (u: AdminUser) => sortKey === "name" ? u.full_name : sortKey === "email" ? u.email : sortKey === "role" ? ROLE_LABELS[u.role] : u.created_at;
    return [...list].sort((a, b) => (asc ? 1 : -1) * val(a).localeCompare(val(b), "de"));
  }, [users, search, roleFilter, sortKey, asc]);
  const toggle = (k: SortKey) => { if (k === sortKey) setAsc((v) => !v); else { setSortKey(k); setAsc(true); } };

  const canDelete = (u: AdminUser) => u.id !== me.id && u.id !== ownerId && !u.is_team && !isClosedAccount(u.email);
  const roleCell = (u: AdminUser) => (u.role === "azubi" || u.role === "it_technik" || u.id === me.id || (u.role === "ausbildungsleitung" && me.role !== "ausbildungsleitung"))
    ? <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
    : (
      <Select value={u.role} onValueChange={(v) => setPending({ user: u, role: v as AppRole })}>
        <SelectTrigger className="h-10 min-w-44" aria-label={`Rolle von ${u.full_name || u.email}`}><SelectValue /></SelectTrigger>
        <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
      </Select>
    );
  const action = (u: AdminUser) => canDelete(u)
    ? <Button variant="outline" size="sm" className="min-h-10 text-destructive" onClick={() => setDeleting(u)}>{u.role === "azubi" ? "Konto löschen" : "Konto schließen"}</Button>
    : null;
  const sortBtn = (k: SortKey, label: string) => <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => toggle(k)}>{label} <ArrowUpDown className="size-3.5" aria-hidden /></button>;

  return (
    <Card id="konten" title="Konten" action={
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen …" aria-label="Konten suchen" className="h-10 text-base sm:w-56" />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-10 sm:w-48" aria-label="Nach Rolle filtern"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="alle">Alle Rollen</SelectItem>{ROLE_ORDER.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    }>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sortBtn("name", "Name")}</TableHead>
              <TableHead>{sortBtn("email", "E-Mail")}</TableHead>
              <TableHead>{sortBtn("role", "Rolle")}</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>{sortBtn("created", "Registriert am")}</TableHead>
              <TableHead className="text-right">Konto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}{u.is_team && <Badge className="ml-2" variant="outline">Team</Badge>}</TableCell>
                <TableCell className="break-all">{u.email}</TableCell>
                <TableCell>{roleCell(u)}</TableCell>
                <TableCell>{u.organization ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{dateDe(u.created_at)}</TableCell>
                <TableCell className="text-right">{action(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden">
        {filtered.map((u) => (
          <li key={u.id} className="space-y-2 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{u.full_name || "—"}</p>{u.is_team && <Badge variant="outline">Team</Badge>}</div>
            <p className="break-all text-sm text-muted-foreground">{u.email}</p>
            {u.organization && <p className="text-sm">{u.organization}</p>}
            <p className="text-xs text-muted-foreground">Registriert am {dateDe(u.created_at)}</p>
            {roleCell(u)}
            {action(u)}
          </li>
        ))}
      </ul>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">Keine Konten gefunden.</p>}
      {deleting && <DeleteAccountDialog user={deleting} onClose={() => setDeleting(null)} />}
      <ConfirmDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Rolle ändern?" confirmLabel="Rolle ändern"
        description="Alle Zugriffe dieser Person auf Berichtshefte werden beendet."
        onConfirm={() => { if (pending) roleM.mutate(pending); setPending(null); }} />
    </Card>
  );
}

function TeamCard({ team, me }: { team: TeamMember[]; me: MyProfile }) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["admin-team"] }), client.invalidateQueries({ queryKey: ["admin-users"] })]);
  const add = useMutation({ mutationFn: adminAddTeamMember, onSuccess: async () => { setEmail(""); toast.success("Zum Team hinzugefügt"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: adminRemoveTeamMember, onSuccess: async () => { toast.success("Aus dem Team entfernt"); await refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const owner = !!me.is_team_owner;
  return (
    <Card id="team" title="Team">
      {team.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Team-Mitglieder.</p> : (
        <ul className="divide-y">
          {team.map((t) => (
            <li key={t.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <ShieldCheck className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{t.full_name || "—"}</p><Badge variant={t.is_owner ? "default" : "secondary"}>{t.is_owner ? "Inhaber" : "Mitglied"}</Badge></div>
                <p className="break-all text-sm text-muted-foreground">{t.email} · seit {dateDe(t.created_at)}</p>
              </div>
              {owner && !t.is_owner && <Button variant="outline" size="sm" className="min-h-10" onClick={() => setRemoving(t)}>Entfernen</Button>}
            </li>
          ))}
        </ul>
      )}
      {owner && (
        <form className="mt-4 space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(email); }}>
          <Label htmlFor="team-email">E-Mail-Adresse einer bestätigten Person</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base sm:max-w-sm" autoComplete="off" />
            <Button type="submit" className="h-11" disabled={add.isPending || !email.trim()}>Zum Team hinzufügen</Button>
          </div>
        </form>
      )}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Aus dem Team entfernen?" destructive confirmLabel="Entfernen"
        description={`${removing?.full_name || removing?.email || "Die Person"} verliert die Verwaltungsrechte.`}
        onConfirm={() => { if (removing) remove.mutate(removing.user_id); setRemoving(null); }} />
    </Card>
  );
}
