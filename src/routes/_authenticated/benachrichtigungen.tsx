import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";
import { useMyProfile } from "@/features/app/session";

const TITLE = "Benachrichtigungen – Azuvera";

export const Route = createFileRoute("/_authenticated/benachrichtigungen")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "Deine Benachrichtigungen bei Azuvera." },
      { property: "og:title", content: TITLE },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BenachrichtigungenPage,
});

function BenachrichtigungenPage() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["notifications", "list", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    await refresh();
  };

  const markAllRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) {
      toast.error("Konnte nicht als gelesen markiert werden.");
      return;
    }
    await refresh();
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    await refresh();
  };

  const hasUnread = (items ?? []).some((n) => !n.read_at);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Benachrichtigungen"
        actions={
          hasUnread ? (
            <Button variant="outline" className="h-11" onClick={() => void markAllRead()}>
              <CheckCheck className="size-4" aria-hidden /> Alle als gelesen markieren
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : (items ?? []).length === 0 ? (
        <EmptyState icon={Bell} title="Keine Benachrichtigungen" description="Hier erscheinen Neuigkeiten zu deinen Berichten." />
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm",
                !n.read_at && "border-primary/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(n.created_at), "d. MMM yyyy, HH:mm 'Uhr'", { locale: de })}
                </p>
                {n.link && (
                  <Link to={n.link} className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                    Öffnen
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.read_at && (
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => void markRead(n.id)} aria-label="Als gelesen markieren">
                    <CheckCheck className="size-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => void remove(n.id)} aria-label="Löschen">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
