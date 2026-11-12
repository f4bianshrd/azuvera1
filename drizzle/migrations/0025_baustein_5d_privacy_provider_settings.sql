INSERT INTO public.app_settings(key, value, is_public) VALUES
  ('ai_provider_text', to_jsonb('einen KI-Modellanbieter (über das KI-Gateway von Lovable)'::text), true),
  ('email_provider_text', to_jsonb('den von Azuvera beauftragten E-Mail-Dienstleister'::text), true)
ON CONFLICT (key) DO NOTHING;