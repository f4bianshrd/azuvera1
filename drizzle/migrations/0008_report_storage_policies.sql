-- Storage-Policies für report-files und signatures
-- Pfade: report-files/<azubi_id>/<report_id>/<attachment_id>.<ext>
--        signatures/<user_id>/<uuid>.png

-- report-files: Lesen – Eigentümer:in oder Sichtberechtigte (Bericht nicht draft)
CREATE POLICY report_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'report-files' AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = split_part(name, '/', 2)::uuid
        AND r.status <> 'draft'
        AND (public.can_view_azubi(auth.uid(), r.azubi_id) OR public.is_leitung(auth.uid()))
    )
  ));

-- report-files: Schreiben nur im eigenen Ordner, solange Bericht draft/rejected
CREATE POLICY report_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-files'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = split_part(name, '/', 2)::uuid
        AND r.azubi_id = auth.uid()
        AND r.status IN ('draft', 'rejected')
    ));

CREATE POLICY report_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'report-files'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = split_part(name, '/', 2)::uuid
        AND r.azubi_id = auth.uid()
        AND r.status IN ('draft', 'rejected')
    ));

-- signatures: nur neu anlegen im eigenen Ordner, kein Überschreiben/Löschen
CREATE POLICY signatures_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND split_part(name, '/', 1) = auth.uid()::text);

-- signatures: Lesen – eigene oder wer den zugehörigen Bericht sehen darf
CREATE POLICY signatures_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.report_signatures s
      JOIN public.reports r ON r.id = s.report_id
      WHERE s.image_path = name
        AND (r.azubi_id = auth.uid()
          OR (r.status <> 'draft' AND (public.can_view_azubi(auth.uid(), r.azubi_id) OR public.is_leitung(auth.uid()))))
    )
  ));