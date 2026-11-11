CREATE OR REPLACE FUNCTION public.display_roles(_ids uuid[])
RETURNS TABLE (user_id uuid, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, ur.role FROM public.user_roles ur WHERE ur.user_id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.display_roles(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.display_roles(uuid[]) TO authenticated;