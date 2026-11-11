DROP TRIGGER reports_guard ON public.reports;
CREATE TRIGGER reports_00_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_guard();