import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Notification = Database['public']['Tables']['notifications']['Row'];
export const PAGE_SIZE = 50;

export async function lastNotifications() {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return data ?? [];
}
export async function unreadCount() {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}
export async function markRead(id?: string) {
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() });
  q = id ? q.eq('id', id) : q.is('read_at', null);
  const { error } = await q;
  if (error) throw error;
}
export const markAllRead = () => markRead();
export function subscribeNotifications(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`bell-${userId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
/** Seite mit 50 Einträgen; `unreadOnly` filtert auf Ungelesene. */
export async function listNotifications(page = 0, unreadOnly = false) {
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Geräte ----------
export interface PushDevice { id: string; device_label: string | null; created_at: string; last_used_at: string | null; endpoint_hash: string | null }
export async function listMyDevices(): Promise<PushDevice[]> {
  const { data, error } = await supabase.from('push_subscriptions').select('id, device_label, created_at, last_used_at, endpoint_hash').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PushDevice[];
}
export async function registerPushSubscription(endpoint: string, p256dh: string, auth: string, label: string) {
  const { error } = await supabase.rpc('register_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_label: label });
  if (error) throw error;
}
export async function removePushSubscription(endpoint: string) {
  const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: endpoint });
  if (error) throw error;
}
export async function removePushDevice(id: string) {
  const { error } = await supabase.rpc('remove_push_device', { p_id: id });
  if (error) throw error;
}

// ---------- Einstellungen ----------
export type GroupKey = 'reports' | 'absences' | 'reminders' | 'deputy';
export type Groups = Record<GroupKey, { push: boolean; email: boolean }>;
export interface NotificationPrefs { groups: Groups; quiet_hours_enabled: boolean; quiet_from: string; quiet_to: string; daily_nudge_enabled: boolean; daily_nudge_time: string }
const hm = (t: string) => t.slice(0, 5);
export async function getMyPrefs(): Promise<NotificationPrefs> {
  const { data, error } = await supabase.rpc('get_my_notification_prefs');
  if (error) throw error;
  const r = (data as unknown as NotificationPrefs[])[0]!;
  return { ...r, quiet_from: hm(r.quiet_from), quiet_to: hm(r.quiet_to), daily_nudge_time: hm(r.daily_nudge_time) };
}
export async function saveMyPrefs(p: NotificationPrefs) {
  const { error } = await supabase.rpc('save_my_notification_prefs', {
    p_groups: p.groups, p_quiet_enabled: p.quiet_hours_enabled, p_quiet_from: p.quiet_from, p_quiet_to: p.quiet_to,
    p_nudge_enabled: p.daily_nudge_enabled, p_nudge_time: p.daily_nudge_time,
  });
  if (error) throw error;
}

// ---------- Funktionen ----------
async function authed(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const h = new Headers(init.headers);
  if (data.session) h.set('Authorization', `Bearer ${data.session.access_token}`);
  if (init.body) h.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers: h });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Das hat nicht geklappt.');
  return body;
}
export async function getPushConfig(): Promise<{ configured: boolean; publicKey: string | null }> {
  const res = await fetch('/api/public/push-config', { cache: 'no-store' });
  if (!res.ok) throw new Error('push-config');
  return res.json();
}
export const sendTestPush = (endpoint: string) => authed('/api/push-test', { method: 'POST', body: JSON.stringify({ endpoint }) });
export const sendTestEmail = () => authed('/api/email-test', { method: 'POST' });
export interface NotificationStatus { push: boolean; email: boolean; pending: number; failed7d: number; lastSentAt: string | null }
export const notificationStatus = () => authed('/api/notification-status') as unknown as Promise<NotificationStatus>;
