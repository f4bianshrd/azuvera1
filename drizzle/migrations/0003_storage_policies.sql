-- Storage-Policies für company-logos: lesen alle Angemeldeten, schreiben nur die Ausbildungsleitung
create policy company_logos_read on storage.objects for select to authenticated
  using (bucket_id = 'company-logos');
create policy company_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and public.is_leitung(auth.uid()));
create policy company_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and public.is_leitung(auth.uid()))
  with check (bucket_id = 'company-logos' and public.is_leitung(auth.uid()));
create policy company_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and public.is_leitung(auth.uid()));