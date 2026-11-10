-- Fix: current_setting(..., true) liefert NULL, wenn die Variable nie gesetzt wurde;
-- NOT NULL ist NULL, die Prüfung wurde übersprungen. coalesce behebt das.
CREATE OR REPLACE FUNCTION public.reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bypass boolean := coalesce(current_setting('app.bypass_guard', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' AND NOT bypass THEN
      RAISE EXCEPTION 'Freigegebene Berichte können nicht gelöscht werden.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT bypass AND (NEW.status <> 'draft' OR NEW.version <> 1 OR NEW.content_hash IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_id IS NOT NULL
       OR NEW.review_note IS NOT NULL) THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System gesetzt werden.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'approved' AND NOT bypass THEN
    RAISE EXCEPTION 'Freigegebene Berichte sind unveränderlich.';
  END IF;

  IF NOT bypass THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
      RAISE EXCEPTION 'Status und Prüffelder können nur vom System geändert werden.';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'draft' AND NEW.status = 'submitted')
      OR (OLD.status = 'rejected' AND NEW.status = 'submitted')
      OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected'))
      OR (OLD.status = 'approved' AND NEW.status = 'draft')
    ) THEN
      RAISE EXCEPTION 'Dieser Statusübergang ist nicht erlaubt.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Version des Testberichts zurücksetzen, die durch die Lücke verändert wurde
SELECT 1; -- Platzhalter, Datenkorrektur erfolgt über das Abfrage-Werkzeug