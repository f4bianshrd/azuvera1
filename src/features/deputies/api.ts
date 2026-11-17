import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { displayNames } from '@/features/reports/api';
export type Deputy=Database['public']['Tables']['deputies']['Row'] & {principalName:string;deputyName:string};
export async function listDeputies():Promise<Deputy[]>{const {data,error}=await supabase.from('deputies').select('*').order('date_from',{ascending:false});if(error)throw error;const names=await displayNames((data??[]).flatMap(d=>[d.principal_id,d.deputy_id]));return (data??[]).map(d=>({...d,principalName:names.get(d.principal_id)??'—',deputyName:names.get(d.deputy_id)??'—'}));}
/** Vertretung per E-Mail-Adresse finden (nur prüfende Rollen). */
export async function findDeputy(email:string){const {data,error}=await supabase.rpc('find_possible_deputy',{p_email:email.trim()});if(error)throw error;return data?.[0]??null;}
/** Ausbildungsleitung: prüfende Personen, für die eine Vertretung eingetragen werden kann. */
export async function reviewerPeople(){const {data,error}=await supabase.rpc('admin_list_users');if(error)throw error;return (data??[]).filter(p=>p.role==='ausbilder'||p.role==='betriebsleiter'||p.role==='ausbildungsberater').map(p=>({id:p.id,full_name:p.full_name,role:p.role}));}
export async function setDeputy(input:{principal:string;deputy:string;from:string;to:string;reason:string;note:string}){const {error}=await supabase.rpc('set_deputy',{_principal:input.principal,_deputy:input.deputy,_date_from:input.from,_date_to:input.to,_reason:input.reason,_note:input.note});if(error)throw error;}
export async function endDeputy(id:string){const {error}=await supabase.rpc('revoke_deputy',{_id:id});if(error)throw error;}

