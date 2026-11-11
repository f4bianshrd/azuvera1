import { cachedOnline } from "@/lib/sync/online-cache";
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { displayNames, listReportsInRange } from '@/features/reports/api';
import { listAbsentDays } from '@/features/absences/api';
import { listGrades } from '@/features/grades/api';
import { computeCoverage } from '@/features/reports/coverage';
import { currentTrainingYear, trainingYears } from '@/lib/training-year';
import { format } from 'date-fns';
export type WeekRow = Database['public']['Functions']['team_week_overview']['Returns'][number];
export type TeamPerson = Database['public']['Tables']['profiles']['Row'] & WeekRow & { profession: string; company: string; principalName: string; deputyName: string | null };
async function fetchTeam(week: string): Promise<TeamPerson[]> {
 const {data: overview,error}=await supabase.rpc('team_week_overview',{week_start:week}); if(error) throw error;
 if(!overview?.length) return [];
 const [p,prof,comp]=await Promise.all([supabase.from('profiles').select('*').in('id',overview.map(r=>r.azubi_id)),supabase.from('professions').select('id,name'),supabase.from('companies').select('id,name')]);
 if(p.error) throw p.error; if(prof.error) throw prof.error; if(comp.error) throw comp.error;
 const names=await displayNames((p.data??[]).map(r=>r.ausbilder_id??'').filter(Boolean));
 const {data:{user}}=await supabase.auth.getUser();
 return (p.data??[]).flatMap(person=>{const row=overview.find(r=>r.azubi_id===person.id); if(!row)return []; const principalName=names.get(person.ausbilder_id??'')??'Nicht zugewiesen';return [{...person,...row,profession:prof.data?.find(r=>r.id===person.profession_id)?.name??'—',company:comp.data?.find(r=>r.id===person.company_id)?.name??'—',principalName,deputyName:row.can_review&&person.ausbilder_id&&person.ausbilder_id!==user?.id?principalName:null}];});
}
export async function getTeamDetail(id:string) {
 const {data:{user}}=await supabase.auth.getUser(); if(!user) return null;
 const {data:allowed,error}=await supabase.rpc('can_view_azubi',{_viewer:user.id,_azubi:id});if(error)throw error;if(!allowed)return null;
 const {data:p,error:pe}=await supabase.from('profiles').select('*').eq('id',id).maybeSingle();if(pe)throw pe;if(!p)return null;
 const today=new Date(); const start=p.ausbildungsbeginn?new Date(p.ausbildungsbeginn+'T00:00:00'):null;
 const end=p.ausbildungsende?new Date(p.ausbildungsende+'T00:00:00'):undefined;
 const year=start?currentTrainingYear(start,end):null;
 const period=start?trainingYears(start,end).find(y=>y.year===year):null;
 const to=period&&period.end<today?period.end:today;
 const [reports,grades,absences,names,review,profession,company]=await Promise.all([
 supabase.from('reports').select('*').eq('azubi_id',id).order('report_date',{ascending:false}),listGrades(id),period?listAbsentDays(id,format(period.start,'yyyy-MM-dd'),format(to,'yyyy-MM-dd')):Promise.resolve(new Set<string>()),displayNames(p.ausbilder_id?[p.ausbilder_id]:[]),supabase.rpc('can_review_for',{_reviewer:user.id,_azubi:id}),p.profession_id?supabase.from('professions').select('name').eq('id',p.profession_id).maybeSingle():Promise.resolve({data:null,error:null}),p.company_id?supabase.from('companies').select('name').eq('id',p.company_id).maybeSingle():Promise.resolve({data:null,error:null})]);
 if(reports.error)throw reports.error;if(review.error)throw review.error;
 const range=period?await listReportsInRange(id,format(period.start,'yyyy-MM-dd'),format(to,'yyyy-MM-dd')):[];
 return {profile:p,reports:reports.data??[],grades,year,coverage:period?computeCoverage(range,period.start,to,absences):null,canReview:review.data,principalName:names.get(p.ausbilder_id??'')??'Nicht zugewiesen',profession:profession.data?.name??'—',company:company.data?.name??'—'};
}
export async function managementCounts(){const [users,invites]=await Promise.all([supabase.rpc('admin_list_users'),supabase.from('invite_codes').select('id').is('used_at',null).gt('expires_at',new Date().toISOString())]);if(users.error)throw users.error;if(invites.error)throw invites.error;return {unassigned:(users.data??[]).filter(p=>p.role==='azubi'&&!p.ausbilder_id).length,invites:invites.data?.length??0};}

export const listTeam = (week: string) => cachedOnline(`team:${week}`, () => fetchTeam(week));
