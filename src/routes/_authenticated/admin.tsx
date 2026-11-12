import { AzubiPlanSelect } from "@/features/plan/components/azubi-plan-select";
import { useMemo, useState } from "react";
import { copyText } from "@/lib/platform";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Copy, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, ResponsiveDialog } from "@/components/dialogs";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  ROLE_LABELS,
  REVIEWER_ROLES,
  VIEWER_ROLES,
  useMyProfile,
  type AppRole,
} from "@/features/app/session";
import { useCompanies, useProfessions } from "@/features/app/queries";
import { DeletionRequestsCard } from "@/features/account/deletion-requests-card";
import { DeleteAccountDialog, type DeletableUser } from "@/features/account/delete-account-dialog";
import { isClosedAccount } from "@/features/account/rules";

const TITLE = "Administration – Azuvera";
const ALL_ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Benutzer, Rollen und Einladungs-Codes verwalten." },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: "Benutzer, Rollen und Einladungs-Codes verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  ausbilder_id: string | null;
  company_id: string | null;
  profession_id: string | null;
  created_at: string;
}

interface InviteCode {
  id: string;
  code: string;
  role: AppRole;
  note: string | null;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
}

function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-users"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
}

function useInviteCodes(enabled: boolean) {
  return useQuery({
    queryKey: ["invite-codes"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("id, code, role, note, expires_at, used_by, used_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteCode[];
    },
  });
}

function useViewers(enabled: boolean) {
  return useQuery({
    queryKey: ["azubi-viewers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("azubi_viewers").select("azubi_id, viewer_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function AdminPage() {
  const { data: me } = useMyProfile();
  const isLeitung = me?.role === "ausbildungsleitung";
  const usersQuery = useAdminUsers(isLeitung);
  const users = usersQuery.data;

  if (!isLeitung) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Kein Zugriff"
        description="Die Administration steht nur der Ausbildungsleitung zur Verfügung."
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Administration" subtitle="Benutzer, Rollen und Einladungs-Codes verwalten." />
      {usersQuery.isLoading || !users ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <DeletionRequestsCard users={users} />
          <UsersCard users={users} myId={me?.id ?? ""} />
        </>
      )}
      <InviteCodesCard />
    </div>
  );
}

type SortKey = "name" | "email" | "role";

function UsersCard({ users, myId }: { users: AdminUser[]; myId: string }) {
  const queryClient = useQueryClient();
  const { data: companies } = useCompanies();
  const { data: professions } = useProfessions();
  const { data: viewers } = useViewers(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [pendingRole, setPendingRole] = useState<{ user: AdminUser; role: AppRole } | null>(null);
  const [deleting, setDeleting] = useState<DeletableUser | null>(null);

  const reviewers = users.filter((u) => REVIEWER_ROLES.includes(u.role) && !isClosedAccount(u.email));
  const viewerCandidates = users.filter((u) => VIEWER_ROLES.includes(u.role));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const changeRole = async (user: AdminUser, role: AppRole) => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: user.id, _role: role });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rolle geändert");
    await refresh();
  };

  const updateAzubi = async (azubiId: string, patch: Record<string, string | null>, okToast: string) => {
    const { error } = await supabase.rpc("admin_update_azubi", { _azubi_id: azubiId, _patch: patch });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(okToast);
    await refresh();
  };

  const setViewers = async (azubiId: string, viewerIds: string[]) => {
    const { error } = await supabase.rpc("admin_set_viewers", { _azubi_id: azubiId, _viewer_ids: viewerIds });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lesezugriff gesetzt");
    await queryClient.invalidateQueries({ queryKey: ["azubi-viewers"] });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter(
      (u) =>
        (roleFilter === "alle" || u.role === roleFilter) &&
        (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
    return [...list].sort((a, b) => {
      const va = sortKey === "name" ? a.full_name : sortKey === "email" ? a.email : ROLE_LABELS[a.role];
      const vb = sortKey === "name" ? b.full_name : sortKey === "email" ? b.email : ROLE_LABELS[b.role];
      return (sortAsc ? 1 : -1) * va.localeCompare(vb, "de");
    });
  }, [users, search, roleFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const roleSelect = (u: AdminUser) => (
    <Select
      value={u.role}
      disabled={u.id === myId}
      onValueChange={(v) => setPendingRole({ user: u, role: v as AppRole })}
    >
      <SelectTrigger className="h-10 w-full min-w-40" aria-label={`Rolle von ${u.full_name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const accountAction = (u: AdminUser) => {
    if (isClosedAccount(u.email)) return <Badge variant="outline">Geschlossen</Badge>;
    if (u.id === myId) return null;
    return (
      <Button variant="outline" size="sm" className="h-10 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setDeleting(u)}>
        {u.role === "azubi" ? "Konto löschen" : "Konto schließen"}
      </Button>
    );
  };

  const azubiControls = (u: AdminUser) => {
    if (u.role !== "azubi") return null;
    const assigned = (viewers ?? []).filter((v) => v.azubi_id === u.id).map((v) => v.viewer_id);
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={u.ausbilder_id ?? "none"}
          onValueChange={(v) => void updateAzubi(u.id, { ausbilder_id: v === "none" ? null : v }, "Zugewiesen")}
        >
          <SelectTrigger className="h-10" aria-label="Zuständige:r Ausbilder:in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— ohne —</SelectItem>
            {reviewers.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={u.company_id ?? "none"}
          onValueChange={(v) => void updateAzubi(u.id, { company_id: v === "none" ? null : v }, "Betrieb gesetzt")}
        >
          <SelectTrigger className="h-10" aria-label="Betrieb">
            <SelectValue placeholder="Betrieb" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— ohne —</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={u.profession_id ?? "none"}
          onValueChange={(v) => void updateAzubi(u.id, { profession_id: v === "none" ? null : v }, "Beruf gesetzt")}
        >
          <SelectTrigger className="h-10" aria-label="Beruf">
            <SelectValue placeholder="Beruf" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— ohne —</SelectItem>
            {(professions ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ViewerPicker
          candidates={viewerCandidates}
          selected={assigned}
          onApply={(ids) => void setViewers(u.id, ids)}
        />
      </div>
    );
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Benutzer &amp; Rollen</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="h-10 text-base sm:w-56"
            aria-label="Benutzer suchen"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-10 sm:w-48" aria-label="Nach Rolle filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Rollen</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabelle ab Tablet */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="inline-flex items-center gap-1 font-medium" onClick={() => toggleSort("name")}>
                  Name <ArrowUpDown className="size-3.5" aria-hidden />
                </button>
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 font-medium" onClick={() => toggleSort("email")}>
                  E-Mail <ArrowUpDown className="size-3.5" aria-hidden />
                </button>
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 font-medium" onClick={() => toggleSort("role")}>
                  Rolle <ArrowUpDown className="size-3.5" aria-hidden />
                </button>
              </TableHead>
              <TableHead>Zuordnung (Azubis)</TableHead>
              <TableHead>Ausbildungsplan</TableHead>
              <TableHead className="text-right">Konto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{roleSelect(u)}</TableCell>
                <TableCell className="min-w-[22rem]">{azubiControls(u)}</TableCell>
                <TableCell className="min-w-48">{u.role === "azubi" ? <AzubiPlanSelect azubiId={u.id} professionId={u.profession_id} /> : "—"}</TableCell>
                <TableCell className="text-right">{accountAction(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Karten auf dem Handy */}
      <div className="mt-4 space-y-3 md:hidden">
        {filtered.map((u) => (
          <div key={u.id} className="space-y-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">{u.full_name || "—"}</p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
            </div>
            {roleSelect(u)}
            {azubiControls(u)}
            {u.role === "azubi" && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Ausbildungsplan</p><AzubiPlanSelect azubiId={u.id} professionId={u.profession_id} /></div>}
            {accountAction(u)}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Keine Benutzer gefunden.</p>
      )}

      {deleting && <DeleteAccountDialog user={deleting} onClose={() => setDeleting(null)} />}

      <ConfirmDialog
        open={!!pendingRole}
        onOpenChange={(o) => !o && setPendingRole(null)}
        title="Rolle ändern?"
        description={
          pendingRole
            ? `${pendingRole.user.full_name || pendingRole.user.email} erhält die Rolle „${ROLE_LABELS[pendingRole.role]}“.`
            : undefined
        }
        confirmLabel="Rolle ändern"
        onConfirm={() => {
          if (pendingRole) void changeRole(pendingRole.user, pendingRole.role);
          setPendingRole(null);
        }}
      />
    </section>
  );
}

function ViewerPicker({
  candidates,
  selected,
  onApply,
}: {
  candidates: AdminUser[];
  selected: string[];
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>(selected);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setChecked(selected);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 justify-start font-normal">
          Lesezugriff für{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 text-sm font-medium">Lesezugriff für</p>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Ausbildungsberater:innen oder Lehrer:innen vorhanden.
          </p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked.includes(c.id)}
                    onCheckedChange={(v) =>
                      setChecked((cur) => (v === true ? [...cur, c.id] : cur.filter((x) => x !== c.id)))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{c.full_name || c.email}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {ROLE_LABELS[c.role]}
                  </Badge>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Button
          className="mt-3 h-10 w-full"
          onClick={() => {
            onApply(checked);
            setOpen(false);
          }}
        >
          Übernehmen
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function InviteCodesCard() {
  const queryClient = useQueryClient();
  const { data: codes, isLoading } = useInviteCodes(true);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole>("ausbilder");
  const [days, setDays] = useState("14");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_invite_code", {
      _role: role,
      _valid_days: Number(days),
      ...(note.trim() ? { _note: note.trim() } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCreated(data);
    setNote("");
    await queryClient.invalidateQueries({ queryKey: ["invite-codes"] });
  };

  const revoke = async (code: string) => {
    const { error } = await supabase.rpc("revoke_invite_code", { _code: code });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Code widerrufen");
    await queryClient.invalidateQueries({ queryKey: ["invite-codes"] });
  };

  const copy = async (code: string) => {
    try {
      await copyText(code);
      toast.success("Code kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const statusOf = (c: InviteCode): { label: string; cls: string } => {
    if (c.used_by) return { label: "Eingelöst", cls: "bg-muted text-muted-foreground" };
    if (new Date(c.expires_at) <= new Date()) return { label: "Abgelaufen", cls: "bg-destructive/10 text-destructive" };
    return { label: "Offen", cls: "bg-success/15 text-foreground" };
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Einladungs-Codes</h2>
        <Button className="h-10" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Code erzeugen
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : (codes ?? []).length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Noch keine Codes erzeugt.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {(codes ?? []).map((c) => {
            const s = statusOf(c);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                <code className="font-mono text-sm font-semibold tracking-widest">{c.code}</code>
                <Badge variant="secondary">{ROLE_LABELS[c.role]}</Badge>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>
                {c.note && <span className="text-xs text-muted-foreground">{c.note}</span>}
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void copy(c.code)}>
                    <Copy className="size-3.5" aria-hidden /> Kopieren
                  </Button>
                  {!c.used_by && (
                    <Button variant="ghost" size="sm" onClick={() => void revoke(c.code)}>
                      Widerrufen
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Code erzeugen" description="Der Code gilt einmal und läuft nach der gewählten Zeit ab.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.filter((r) => r !== "azubi").map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code-days">Gültigkeit in Tagen (1–60)</Label>
            <Input
              id="code-days"
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code-note">Notiz</Label>
            <Input id="code-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11 text-base" />
          </div>
          {created && (
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted p-3">
              <code className="font-mono text-lg font-bold tracking-widest">{created}</code>
              <Button variant="outline" size="sm" onClick={() => void copy(created)}>
                <Copy className="size-3.5" aria-hidden /> Kopieren
              </Button>
            </div>
          )}
          <Button className="h-11 w-full" onClick={() => void create()} disabled={busy}>
            Code erzeugen
          </Button>
        </div>
      </ResponsiveDialog>
    </section>
  );
}
