import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProfessions() {
  return useQuery({
    queryKey: ["professions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("professions")
        .select("id, name, code, chamber, description, duration_months, ai_hints")
        .order("name");
      return data ?? [];
    },
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("*").order("name");
      return data ?? [];
    },
  });
}
