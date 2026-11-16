import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
export type MissingWeek=Database['public']['Functions']['missing_weeks']['Returns'][number];
export type Reminder=Database['public']['Tables']['report_reminders']['Row'];
export async function missingWeeks(id?:string){const {data,error}=await supabase.rpc('missing_weeks',id?{p_azubi:id}:{});if(error)throw error;return data??[];}
export async function reminderHistory(limit=50){const {data,error}=await supabase.from('report_reminders').select('*').order('created_at',{ascending:false}).limit(limit);if(error)throw error;return data??[];}
export async function sendReminder(id:string,period:string,message:string){const {data,error}=await supabase.rpc('send_report_reminder',{azubi_id:id,period_label:period,message});if(error)throw error;return data;}

export type ReminderRules = {
  enabled: boolean; deadline_weekday: number; deadline_time: string;
  soon_enabled: boolean; soon_weekday: number; soon_time: string;
  today_enabled: boolean; today_time: string;
  overdue_enabled: boolean; overdue_time: string; overdue_every_days: number; overdue_max: number;
  review_enabled: boolean; review_weekdays: number[]; review_time: string; review_after_days: number;
  experience_enabled: boolean; experience_days_before: number[]; experience_time: string;
};
export async function getReminderRules(){const {data,error}=await supabase.rpc('get_reminder_rules');if(error)throw error;return data as unknown as ReminderRules;}
export async function saveReminderRules(rules:ReminderRules){const {error}=await supabase.rpc('save_reminder_rules',{p_rules:rules as never});if(error)throw error;}
