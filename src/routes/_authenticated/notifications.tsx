import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { de } from "date-fns/locale";
import { deleteNotification, listNotifications, markAllRead, markRead, PAGE_SIZE, subscribeNotifications, type Notification } from "@/features/notifications/api";
import { useUnreadCount } from "@/features/notifications/notification-bell";
import { iconFor, internalTarget } from "@/features/notifications/icons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { useMyProfile } from "@/features/app/session";
import { useOnline } from "@/lib/sync/status";
import { cn } from "@/lib/utils";

const TITLE = "Benachrichtigungen – Azuvera";
const DESC = "Alle Hinweise zu Berichten, Kommentaren, Abwesenheiten und Erinnerungen.";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function dayLabel(d: Date) {
  if (isToday(d)) return "Heute";
  if (isYesterday(d)) return "Gestern";
  return format(d, "d. MMMM yyyy", { locale: de });
}

function NotificationsPage() {
  const { data: me } = useMyProfile();
  const online = useOnline();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data: unread = 0 } = useUnreadCount(me?.id);

  const q = useInfiniteQuery({
    queryKey: ["notifications", "page", me?.id, filter],
    enabled: !!me?.id,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listNotifications(pageParam, filter === "unread"),
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length : undefined),
    networkMode: "offlineFirst",
  });
  useEffect(() => (me?.id ? subscribeNotifications(me.id, () => void qc.invalidateQueries({ queryKey: ["notifications"] })) : undefined), [me?.id, qc]);

  const items = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  const groups = useMemo(() => {
    const out: { label: string; items: Notification[] }[] = [];
    for (const n of items) {
      const label = dayLabel(new Date(n.created_at));
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [items]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const open = async (n: Notification) => {
    if (online && !n.read_at) { try { await markRead(n.id); await refresh(); } catch { /* weiter öffnen */ } }
    const t = internalTarget(n.link);
    if (t) void navigate({ to: t.to, search: t.search });
  };
  const readAll = async () => {
    try { await markAllRead(); await refresh(); } catch { toast.error("Konnte nicht als gelesen markiert werden."); }
  };
  const remove = async (id: string) => {
    try { await deleteNotification(id); await refresh(); } catch { toast.error("Benachrichtigung konnte nicht gelöscht werden."); }
  };

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <PageHeader
          title="Benachrichtigungen"
          subtitle={unread > 0 ? `${unread} ungelesen` : "Alles gelesen"}
          actions={unread > 0 ? <Button variant="outline" className="h-11" disabled={!online} onClick={() => void readAll()}>Alle als gelesen markieren</Button> : undefined}
        />
        {!online && q.dataUpdatedAt > 0 && (
          <p className="rounded-xl border bg-muted px-4 py-3 text-sm text-muted-foreground">Offline – Stand von {format(new Date(q.dataUpdatedAt), "HH:mm 'Uhr'", { locale: de })}</p>
        )}
        <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as "all" | "unread")} className="justify-start">
          <ToggleGroupItem value="all" className="h-10 px-4">Alle</ToggleGroupItem>
          <ToggleGroupItem value="unread" className="h-10 px-4">Ungelesen</ToggleGroupItem>
        </ToggleGroup>

        {q.isLoading ? <ListSkeleton /> : items.length === 0 ? (
          <EmptyState icon={Bell} title="Keine Benachrichtigungen" description="Hier erscheinen Hinweise zu Berichten, Kommentaren, Abwesenheiten und Erinnerungen." />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.label}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{g.label}</h2>
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
                  {g.items.map((n) => {
                    const Icon = iconFor(n.type);
                    const at = new Date(n.created_at);
                    return (
                      <li key={n.id} className="flex items-start gap-1">
                        <button type="button" onClick={() => void open(n)} className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left hover:bg-muted/50">
                          <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block text-sm", !n.read_at && "font-bold")}>
                              {n.title}{!n.read_at && <span className="ml-2 inline-block size-2 rounded-full bg-primary" aria-label="ungelesen" />}
                            </span>
                            {n.body && <span className="mt-1 block break-words text-sm text-muted-foreground">{n.body}</span>}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="mt-1 inline-block text-xs text-muted-foreground">{formatDistanceToNow(at, { addSuffix: true, locale: de })}</span>
                              </TooltipTrigger>
                              <TooltipContent>{format(at, "d. MMMM yyyy, HH:mm 'Uhr'", { locale: de })}</TooltipContent>
                            </Tooltip>
                          </span>
                        </button>
                        <Button variant="ghost" size="icon" className="m-2 h-11 w-11 shrink-0" aria-label="Löschen" disabled={!online} onClick={() => void remove(n.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {q.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" className="h-11" disabled={q.isFetchingNextPage || !online} onClick={() => void q.fetchNextPage()}>Mehr laden</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
