DROP POLICY company_logos_read ON storage.objects;
CREATE POLICY company_logos_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-logos' AND (
      public.is_leitung(auth.uid())
      OR owner_id = (SELECT auth.uid()::text)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        JOIN public.profiles p ON p.company_id = c.id
        WHERE p.id = auth.uid() AND c.logo_url = storage.objects.name
      )
    )
  );