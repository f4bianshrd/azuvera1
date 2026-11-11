import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { displayNames } from '@/features/reports/api';
export type Deputy=Database['public']['Tables']['deputies']['Row'] & {principalName:string;deputyName:string};
export async function listDeputies():Promise<Deputy[]>{const {data,error}=await supabase.from('deputies').select('*').order('date_from',{ascending:false});if(error)throw error;const names=await displayNames((data??[]).flatMap(d=>[d.principal_id,d.deputy_id]));return (data??[]).map(d=>({...d,principalName:names.get(d.principal_id)??'—',deputyName:names.get(d.deputy_id)??'—'}));}
export async function possibleDeputies(){const {data,error}=await supabase.rpc('list_possible_deputies');if(error)throw error;return data??[];}
export async function deputySelfService(){const {data,error}=await supabase.from('app_settings').select('value').eq('key','deputy_self_service').maybeSingle();if(error)throw error;return data?.value===true;}
export async function saveDeputySetting(value:boolean){const {error}=await supabase.from('app_settings').upsert({key:'deputy_self_service',value,is_public:false});if(error)throw error;}
export async function setDeputy(input:{principal:string;deputy:string;from:string;to:string;reason:string;note:string}){const {error}=await supabase.rpc('set_deputy',{_principal:input.principal,_deputy:input.deputy,_date_from:input.from,_date_to:input.to,_reason:input.reason,_note:input.note});if(error)throw error;}
export async function endDeputy(id:string){const {error}=await supabase.rpc('revoke_deputy',{_id:id});if(error)throw error;}

export async function hostingLocation(){const {data,error}=await supabase.from('app_settings').select('value').eq('key','hosting_location_text').maybeSingle();if(error)throw error;return typeof data?.value==='string'?data.value:'';}
export async function saveHostingLocation(value:string,userId:string|null){const {error}=await supabase.from('app_settings').upsert({key:'hosting_location_text',value,is_public:true,updated_by:userId});if(error)throw error;}
