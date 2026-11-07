INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'course-videos',
  'course-videos',
  false,
  52428800,
  ARRAY['video/mp4', 'video/webm']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  _bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO _bucket
  FROM storage.buckets
  WHERE id = 'course-videos';

  IF NOT FOUND
    OR _bucket.public
    OR _bucket.file_size_limit IS NULL
    OR _bucket.file_size_limit < 52428800
    OR _bucket.allowed_mime_types IS NULL
    OR NOT (_bucket.allowed_mime_types @> ARRAY['video/mp4', 'video/webm']::text[])
  THEN
    RAISE EXCEPTION
      'The course-videos bucket must be private, allow MP4/WebM, and have a per-file limit of at least 50 MiB.';
  END IF;
END $$;

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
