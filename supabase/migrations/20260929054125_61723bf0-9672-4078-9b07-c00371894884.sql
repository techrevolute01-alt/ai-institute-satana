GRANT SELECT ON public.packages, public.courses, public.package_courses, public.package_includes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages, public.courses, public.package_courses, public.package_includes TO authenticated;
GRANT ALL ON public.packages, public.courses, public.package_courses, public.package_includes TO service_role;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon;