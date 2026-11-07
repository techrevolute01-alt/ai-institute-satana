DROP POLICY IF EXISTS package_courses_read ON public.package_courses;
CREATE POLICY package_courses_read ON public.package_courses FOR SELECT
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.status = 'published')
      AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.status = 'published'))
);