/** Selbstauskunft der Azubis zur Ausbildung (Beruf, Betrieb). Online-Aktion. */
import { supabase } from "@/integrations/supabase/client";

export async function listCompanyChoices(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("list_company_choices");
  if (error) throw error;
  return data ?? [];
}

export async function setMyTraining(input: { professionId: string | null; companyId: string | null; newCompanyName?: string; newCompanyAddress?: string }): Promise<void> {
  const { error } = await supabase.rpc("set_my_training", {
    p_profession: input.professionId as string,
    p_company: input.companyId as string,
    p_new_company_name: input.newCompanyName?.trim() || (null as unknown as string),
    p_new_company_address: input.newCompanyAddress?.trim() || (null as unknown as string),
  });
  if (error) throw error;
}
