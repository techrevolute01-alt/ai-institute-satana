REVOKE ALL ON public.users FROM anon;
GRANT SELECT ON public.users TO authenticated;
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, mobile, avatar_url) ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;