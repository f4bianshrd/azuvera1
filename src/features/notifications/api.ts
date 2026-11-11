import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
export type Notification=Database['public']['Tables']['notifications']['Row'];
export async function lastNotifications(){const {data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(10);if(error)throw error;return data??[];}
export async function unreadCount(){const {count,error}=await supabase.from('notifications').select('id',{count:'exact',head:true}).is('read_at',null);if(error)throw error;return count??0;}
export async function markRead(id?:string){let q=supabase.from('notifications').update({read_at:new Date().toISOString()});q=id?q.eq('id',id):q.is('read_at',null);const {error}=await q;if(error)throw error;}
export function subscribeNotifications(userId:string,onChange:()=>void){const channel=supabase.channel(`bell-${userId}-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},onChange).subscribe();return()=>{void supabase.removeChannel(channel);};}

export async function listNotifications(){const {data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;return data??[];}
export async function deleteNotification(id:string){const {error}=await supabase.from('notifications').delete().eq('id',id);if(error)throw error;}
