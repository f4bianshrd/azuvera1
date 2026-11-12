import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { onServiceWorkerMessage, onVisibilityChange, setAppBadge } from '@/lib/platform';
import { useOnline } from '@/lib/sync/status';
import { lastNotifications, markRead, unreadCount, subscribeNotifications } from './api';
import { iconFor, internalTarget } from './icons';
import { ensurePushOnStart } from './push';

export function useUnreadCount(userId: string | undefined) {
  return useQuery({ queryKey: ['notifications', 'unread', userId], queryFn: unreadCount, enabled: !!userId });
}

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const { data: unread = 0 } = useUnreadCount(userId);
  const { data: items = [] } = useQuery({ queryKey: ['notifications', 'latest', userId], queryFn: lastNotifications });
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: ['notifications'] }), client.invalidateQueries({ queryKey: ['review'] }),
    client.invalidateQueries({ queryKey: ['team'] }), client.invalidateQueries({ queryKey: ['deputies'] }),
  ]);
  useEffect(() => subscribeNotifications(userId, () => { void refresh(); }), [userId, client]);
  useEffect(() => { void setAppBadge(unread); }, [unread]);
  useEffect(() => onVisibilityChange((v) => { if (v) void client.invalidateQueries({ queryKey: ['notifications', 'unread'] }); }), [client]);
  useEffect(() => { if (online) void ensurePushOnStart(); }, [online, userId]);
  useEffect(() => onServiceWorkerMessage((d) => {
    const m = d as { type?: string; url?: string } | null;
    const t = m?.type === 'NAVIGATE' ? internalTarget(m.url) : null;
    if (t) void navigate({ to: t.to, search: t.search });
  }), [navigate]);

  async function read(id?: string, link?: string | null) {
    try {
      await markRead(id);
      await refresh();
      const t = internalTarget(link);
      if (t) { setOpen(false); void navigate({ to: t.to, search: t.search }); }
    } catch { toast.error('Benachrichtigung konnte nicht geöffnet werden.'); }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11" aria-label="Benachrichtigungen">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <h2 className="border-b p-4 font-semibold">Benachrichtigungen</h2>
        <ul className="max-h-[55vh] overflow-y-auto">
          {items.map((item) => {
            const Icon = iconFor(item.type);
            return (
              <li key={item.id} className="border-b">
                <Button variant="ghost" className="h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none p-4 text-left" onClick={() => void read(item.id, item.link)}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${!item.read_at ? 'font-bold' : ''}`}>{item.title}{!item.read_at && <span className="ml-2 inline-block size-2 rounded-full bg-primary" />}</span>
                    <span className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{item.body}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: de })}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
        {!items.length && <p className="p-6 text-sm text-muted-foreground">Keine Benachrichtigungen</p>}
        <div className="grid grid-cols-2 border-t">
          <Button variant="ghost" className="rounded-none" disabled={!unread || !online} onClick={() => void read()}>Alle als gelesen markieren</Button>
          <Button variant="ghost" className="rounded-none" asChild><Link to="/notifications" onClick={() => setOpen(false)}>Alle anzeigen</Link></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
