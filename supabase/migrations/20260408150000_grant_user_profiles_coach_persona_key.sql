GRANT INSERT (
  coach_persona_key
) ON public.user_profiles TO authenticated;

GRANT UPDATE (
  coach_persona_key
) ON public.user_profiles TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
