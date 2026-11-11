import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
export type MissingWeek=Database['public']['Functions']['missing_weeks']['Returns'][number];
export type Reminder=Database['public']['Tables']['report_reminders']['Row'];
export async function missingWeeks(id?:string){const {data,error}=await supabase.rpc('missing_weeks',id?{p_azubi:id}:{});if(error)throw error;return data??[];}
export async function reminderHistory(limit=50){const {data,error}=await supabase.from('report_reminders').select('*').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data??[];}
export async function sendReminder(id:string,period:string,message:string){const {data,error}=await supabase.rpc('send_report_reminder',{azubi_id:id,period_label:period,message});if(error)throw error;return data;}
