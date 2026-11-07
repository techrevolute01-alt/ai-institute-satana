  ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status public.content_status NOT NULL DEFAULT 'draft';

GRANT INSERT, UPDATE, DELETE ON public.course_sections, public.lessons TO authenticated;

CREATE OR REPLACE FUNCTION private.has_published_lesson_access(_user uuid, _lesson uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.course_sections s ON s.id = l.section_id
    JOIN public.courses c ON c.id = s.course_id
    WHERE l.id = _lesson
      AND l.status = 'published'
      AND c.status = 'published'
      AND private.has_course_access(_user, c.id)
  )
$$;

REVOKE ALL ON FUNCTION private.has_published_lesson_access(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_published_lesson_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_accessible_course_ids()
RETURNS TABLE(course_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT c.id
  FROM public.courses c
  WHERE c.status = 'published'
    AND private.has_course_access(auth.uid(), c.id)
$$;

REVOKE ALL ON FUNCTION public.my_accessible_course_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_accessible_course_ids() TO authenticated;

DROP POLICY IF EXISTS lessons_access ON public.lessons;
CREATE POLICY lessons_access ON public.lessons
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_published_lesson_access(
    auth.uid(),
    id
  )
);

DROP POLICY IF EXISTS sections_auth ON public.course_sections;
CREATE POLICY sections_access ON public.course_sections
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_id
      AND c.status = 'published'
      AND private.has_course_access(auth.uid(), c.id)
  )
);

DROP POLICY IF EXISTS resources_access ON public.lesson_resources;
CREATE POLICY resources_access ON public.lesson_resources
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_published_lesson_access(auth.uid(), lesson_id)
);

DROP POLICY IF EXISTS quizzes_access ON public.quizzes;
CREATE POLICY quizzes_access ON public.quizzes
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR private.has_published_lesson_access(auth.uid(), lesson_id)
);

DROP POLICY IF EXISTS progress_own ON public.lesson_progress;
CREATE POLICY progress_read_access ON public.lesson_progress
FOR SELECT TO authenticated
USING (
  (user_id = auth.uid() AND private.has_published_lesson_access(auth.uid(), lesson_id))
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY progress_insert_access ON public.lesson_progress
FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND private.has_published_lesson_access(auth.uid(), lesson_id))
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY progress_update_access ON public.lesson_progress
FOR UPDATE TO authenticated
USING (
  (user_id = auth.uid() AND private.has_published_lesson_access(auth.uid(), lesson_id))
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (user_id = auth.uid() AND private.has_published_lesson_access(auth.uid(), lesson_id))
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.reorder_course_lesson(_lesson_id uuid, _direction integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private
AS $$
DECLARE
  _section_id uuid;
  _position integer;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required' USING ERRCODE = '42501';
  END IF;

  IF _direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Direction must be -1 or 1';
  END IF;

  SELECT section_id INTO _section_id
  FROM public.lessons
  WHERE id = _lesson_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lesson not found';
  END IF;

  SELECT position INTO _position
  FROM (
    SELECT id, row_number() OVER (ORDER BY sort_order, id)::integer - 1 AS position
    FROM public.lessons
    WHERE section_id = _section_id
  ) ordered
  WHERE id = _lesson_id;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT row_number() OVER (ORDER BY sort_order, id)::integer - 1 AS position
      FROM public.lessons
      WHERE section_id = _section_id
    ) ordered
    WHERE position = _position + _direction
  ) THEN
    RETURN;
  END IF;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY sort_order, id)::integer - 1 AS position
    FROM public.lessons
    WHERE section_id = _section_id
  ),
  target AS (
    SELECT id, position FROM ordered WHERE id = _lesson_id
  ),
  neighbor AS (
    SELECT id, position FROM ordered WHERE position = _position + _direction
  )
  UPDATE public.lessons l
  SET sort_order = CASE
    WHEN l.id = target.id THEN neighbor.position
    WHEN l.id = neighbor.id THEN target.position
    ELSE ordered.position
  END
  FROM ordered, target, neighbor
  WHERE l.id = ordered.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_course_lesson(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_course_lesson(uuid, integer) TO authenticated;


CREATE OR REPLACE FUNCTION private.has_paid_package_course_access(_user uuid, _course uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE owned_packages(package_id) AS (
    SELECT oi.package_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id = _user
      AND o.status = 'paid'
      AND oi.package_id IS NOT NULL
    UNION
    SELECT pi.included_package_id
    FROM public.package_includes pi
    JOIN owned_packages owned ON owned.package_id = pi.package_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.package_courses pc
    JOIN owned_packages owned ON owned.package_id = pc.package_id
    WHERE pc.course_id = _course
  )
$$;

REVOKE ALL ON FUNCTION private.has_paid_package_course_access(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_paid_package_course_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.has_published_lesson_access(_user uuid, _lesson uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    private.has_role(_user, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.course_sections s ON s.id = l.section_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE l.id = _lesson
        AND l.status = 'published'
        AND c.status = 'published'
        AND private.has_paid_package_course_access(_user, c.id)
    )
$$;

CREATE OR REPLACE FUNCTION public.my_accessible_course_ids()
RETURNS TABLE(course_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT c.id
  FROM public.courses c
  WHERE c.status = 'published'
    AND private.has_paid_package_course_access(auth.uid(), c.id)
$$;

DROP POLICY IF EXISTS sections_access ON public.course_sections;
CREATE POLICY sections_access ON public.course_sections
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_id
      AND c.status = 'published'
      AND private.has_paid_package_course_access(auth.uid(), c.id)
  )
);

CREATE OR REPLACE FUNCTION private.has_course_video_access(_user uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    private.has_role(_user, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.course_sections s ON s.id = l.section_id
      JOIN public.courses c ON c.id = s.course_id
      WHERE l.video_path = 'course-videos/' || _object_name
        AND l.status = 'published'
        AND c.status = 'published'
        AND private.has_paid_package_course_access(_user, c.id)
    )
$$;

REVOKE ALL ON FUNCTION private.has_course_video_access(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.has_course_video_access(uuid, text) TO authenticated;

CREATE POLICY course_videos_admin_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-videos'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY course_videos_entitled_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-videos'
  AND private.has_course_video_access(auth.uid(), name)
);