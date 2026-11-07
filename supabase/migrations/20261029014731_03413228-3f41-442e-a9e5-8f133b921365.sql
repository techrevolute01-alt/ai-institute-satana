ALTER TABLE public.certificates
  ADD COLUMN student_name text NOT NULL DEFAULT '',
  ADD COLUMN course_title text NOT NULL DEFAULT '',
  ADD COLUMN instructor_name text NOT NULL DEFAULT '',
  ADD COLUMN verification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'revoked')),
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid REFERENCES auth.users(id),
  ADD COLUMN revocation_reason text;

UPDATE public.certificates cert
SET student_name = COALESCE(NULLIF(trim(u.full_name), ''), 'Name unavailable'),
    course_title = COALESCE(NULLIF(trim(c.title), ''), 'Course'),
    instructor_name = COALESCE(c.instructor, '')
FROM public.users u, public.courses c
WHERE u.id = cert.user_id AND c.id = cert.course_id;

CREATE UNIQUE INDEX certificates_verification_id_key
  ON public.certificates (verification_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.certificates
    GROUP BY user_id, course_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate certificates exist for a student and course. Resolve duplicates before applying certificate management.';
  END IF;
END
$$;

CREATE UNIQUE INDEX certificates_user_course_key
  ON public.certificates (user_id, course_id);
CREATE INDEX certificates_status_issued_at_idx
  ON public.certificates (status, issued_at DESC);

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_revocation_fields_check
  CHECK (
    (status = 'issued' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (
      status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoked_by IS NOT NULL
      AND COALESCE(length(trim(revocation_reason)) > 0, false)
    )
  );

DROP POLICY IF EXISTS certificates_own ON public.certificates;
CREATE POLICY certificates_read_own_or_admin ON public.certificates
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

REVOKE INSERT, UPDATE, DELETE ON public.certificates FROM authenticated, anon;

DROP POLICY IF EXISTS progress_own ON public.lesson_progress;
DROP POLICY IF EXISTS progress_read_access ON public.lesson_progress;
DROP POLICY IF EXISTS progress_insert_access ON public.lesson_progress;
DROP POLICY IF EXISTS progress_update_access ON public.lesson_progress;

CREATE POLICY progress_read_access ON public.lesson_progress
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND private.has_published_lesson_access(auth.uid(), lesson_id))
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY progress_insert_access ON public.lesson_progress
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY progress_update_access ON public.lesson_progress
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.issue_course_certificate(_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_certificate public.certificates%ROWTYPE;
  v_student_name text;
  v_course_title text;
  v_instructor_name text;
  v_total_lessons integer;
  v_completed_lessons integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = _course_id
      AND c.status = 'published'
      AND private.has_course_access(v_user_id, c.id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this published course.';
  END IF;

  SELECT NULLIF(trim(full_name), '') INTO v_student_name
  FROM public.users
  WHERE id = v_user_id;
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'Add your full name to your profile before requesting a certificate.';
  END IF;
  SELECT title, instructor INTO v_course_title, v_instructor_name
  FROM public.courses
  WHERE id = _course_id;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext(_course_id::text));

  SELECT count(*)::integer INTO v_total_lessons
  FROM public.lessons l
  JOIN public.course_sections s ON s.id = l.section_id
  WHERE s.course_id = _course_id AND l.status = 'published';

  IF v_total_lessons = 0 THEN
    RAISE EXCEPTION 'This course has no published lessons to complete.';
  END IF;

  SELECT count(*)::integer INTO v_completed_lessons
  FROM public.lesson_progress p
  JOIN public.lessons l ON l.id = p.lesson_id
  JOIN public.course_sections s ON s.id = l.section_id
  WHERE p.user_id = v_user_id
    AND p.completed
    AND s.course_id = _course_id
    AND l.status = 'published';

  IF v_completed_lessons <> v_total_lessons THEN
    RAISE EXCEPTION 'Complete all published lessons before requesting a certificate.';
  END IF;

  SELECT * INTO v_certificate
  FROM public.certificates
  WHERE user_id = v_user_id AND course_id = _course_id;

  IF FOUND THEN
    IF v_certificate.status = 'revoked' THEN
      RAISE EXCEPTION 'This certificate was revoked. Contact an administrator.';
    END IF;
    RETURN jsonb_build_object(
      'id', v_certificate.id,
      'certificate_number', v_certificate.certificate_number,
      'verification_id', v_certificate.verification_id,
      'issued_at', v_certificate.issued_at,
      'status', v_certificate.status
    );
  END IF;

  INSERT INTO public.certificates (
    user_id, course_id, certificate_number, student_name, course_title, instructor_name
  )
  VALUES (
    v_user_id,
    _course_id,
    'SKL-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    v_student_name,
    v_course_title,
    COALESCE(v_instructor_name, '')
  )
  RETURNING * INTO v_certificate;

  RETURN jsonb_build_object(
    'id', v_certificate.id,
    'certificate_number', v_certificate.certificate_number,
    'verification_id', v_certificate.verification_id,
    'issued_at', v_certificate.issued_at,
    'status', v_certificate.status
  );
END
$$;

REVOKE ALL ON FUNCTION public.issue_course_certificate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_course_certificate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_course_certificate(
  _certificate_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_certificate public.certificates%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR NOT private.has_role(v_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'A revocation reason is required.';
  END IF;

  UPDATE public.certificates
  SET status = 'revoked',
      revoked_at = now(),
      revoked_by = v_user_id,
      revocation_reason = trim(_reason)
  WHERE id = _certificate_id
    AND status = 'issued'
  RETURNING * INTO v_certificate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issued certificate not found or already revoked.';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'certificate.revoked',
    'certificate',
    v_certificate.id,
    jsonb_build_object('reason', v_certificate.revocation_reason)
  );
END
$$;

REVOKE ALL ON FUNCTION public.revoke_course_certificate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_course_certificate(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_course_certificate(_verification_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'status', c.status,
        'certificate_number', c.certificate_number,
        'student_name', c.student_name,
        'course_title', c.course_title,
        'instructor_name', c.instructor_name,
        'issued_at', c.issued_at,
        'revoked_at', c.revoked_at
      )
      FROM public.certificates c
      WHERE c.verification_id = _verification_id
    ),
    jsonb_build_object('status', 'not_found')
  )
$$;

REVOKE ALL ON FUNCTION public.verify_course_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_course_certificate(uuid) TO anon, authenticated;