CREATE OR REPLACE FUNCTION private.has_course_access(_user uuid, _course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    private.has_role(_user, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.user_id = _user AND e.course_id = _course)
    OR EXISTS (
      WITH RECURSIVE owned AS (
        SELECT oi.package_id AS pid FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
        WHERE o.user_id = _user AND o.status = 'paid' AND oi.package_id IS NOT NULL
        UNION
        SELECT pi.included_package_id FROM public.package_includes pi JOIN owned ON owned.pid = pi.package_id
      )
      SELECT 1 FROM public.package_courses pc JOIN owned ON owned.pid = pc.package_id WHERE pc.course_id = _course
    )
    OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
      WHERE o.user_id = _user AND o.status = 'paid' AND oi.course_id = _course)
  )
$$;
REVOKE ALL ON FUNCTION private.has_course_access(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_course_access(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS lessons_auth ON public.lessons;
CREATE POLICY lessons_access ON public.lessons FOR SELECT TO authenticated USING (
  is_preview OR private.has_course_access(auth.uid(), (SELECT s.course_id FROM public.course_sections s WHERE s.id = section_id)));

DROP POLICY IF EXISTS resources_auth ON public.lesson_resources;
CREATE POLICY resources_access ON public.lesson_resources FOR SELECT TO authenticated USING (
  private.has_course_access(auth.uid(), (SELECT s.course_id FROM public.lessons l JOIN public.course_sections s ON s.id = l.section_id WHERE l.id = lesson_id)));

DROP POLICY IF EXISTS quizzes_auth ON public.quizzes;
CREATE POLICY quizzes_access ON public.quizzes FOR SELECT TO authenticated USING (
  private.has_course_access(auth.uid(), (SELECT s.course_id FROM public.lessons l JOIN public.course_sections s ON s.id = l.section_id WHERE l.id = lesson_id)));