DROP POLICY companies_select ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
  USING (
    public.is_leitung(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.company_id = companies.id
        AND (p.id = auth.uid() OR public.can_view_azubi(auth.uid(), p.id))
    )
  );

DROP POLICY company_professions_select ON public.company_professions;
CREATE POLICY company_professions_select ON public.company_professions FOR SELECT TO authenticated
  USING (
    public.is_leitung(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.company_id = company_professions.company_id
        AND (p.id = auth.uid() OR public.can_view_azubi(auth.uid(), p.id))
    )
  );