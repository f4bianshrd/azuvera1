ALTER TABLE public.reports
  DROP CONSTRAINT reports_activities_check,
  DROP CONSTRAINT reports_school_content_check,
  DROP CONSTRAINT reports_instructions_check,
  DROP CONSTRAINT reports_summary_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_activities_check CHECK (char_length(activities) <= 150000),
  ADD CONSTRAINT reports_school_content_check CHECK (char_length(school_content) <= 150000),
  ADD CONSTRAINT reports_instructions_check CHECK (char_length(instructions) <= 150000),
  ADD CONSTRAINT reports_summary_check CHECK (char_length(summary) <= 150000);