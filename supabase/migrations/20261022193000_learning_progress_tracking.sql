ALTER TABLE public.lesson_progress
  ADD COLUMN completed_at timestamptz;

UPDATE public.lesson_progress
SET completed_at = updated_at
WHERE completed AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION private.stamp_lesson_progress()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.completed THEN
    NEW.completed := true;
  END IF;

  IF NEW.completed THEN
    IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN
      NEW.completed_at := OLD.completed_at;
    ELSE
      NEW.completed_at := now();
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS lesson_progress_stamp ON public.lesson_progress;
CREATE TRIGGER lesson_progress_stamp
  BEFORE INSERT OR UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION private.stamp_lesson_progress();

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

CREATE OR REPLACE FUNCTION public.record_lesson_progress(
  _lesson_id uuid,
  _completed boolean,
  _progress_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_course_id uuid;
  v_progress public.lesson_progress%ROWTYPE;
  v_total_required integer;
  v_completed_required integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF _progress_seconds IS NULL OR _progress_seconds < 0 OR _progress_seconds > 86400 THEN
    RAISE EXCEPTION 'Progress seconds must be between 0 and 86400.';
  END IF;

  SELECT s.course_id INTO v_course_id
  FROM public.lessons l
  JOIN public.course_sections s ON s.id = l.section_id
  WHERE l.id = _lesson_id
    AND l.status = 'published'
    AND private.has_published_lesson_access(auth.uid(), l.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have access to this published lesson.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(auth.uid()::text),
    hashtext(v_course_id::text)
  );

  INSERT INTO public.lesson_progress AS existing (
    user_id, lesson_id, completed, progress_seconds
  )
  VALUES (auth.uid(), _lesson_id, COALESCE(_completed, false), _progress_seconds)
  ON CONFLICT (user_id, lesson_id) DO UPDATE
  SET completed = existing.completed OR EXCLUDED.completed,
      progress_seconds = GREATEST(existing.progress_seconds, EXCLUDED.progress_seconds)
  RETURNING * INTO v_progress;

  SELECT count(*)::integer INTO v_total_required
  FROM public.lessons l
  JOIN public.course_sections s ON s.id = l.section_id
  WHERE s.course_id = v_course_id AND l.status = 'published';

  SELECT count(*)::integer INTO v_completed_required
  FROM public.lesson_progress p
  JOIN public.lessons l ON l.id = p.lesson_id
  JOIN public.course_sections s ON s.id = l.section_id
  WHERE p.user_id = auth.uid()
    AND p.completed
    AND s.course_id = v_course_id
    AND l.status = 'published';

  UPDATE public.enrollments e
  SET completed_at = CASE
    WHEN v_total_required > 0 AND v_completed_required = v_total_required
      THEN COALESCE(e.completed_at, now())
    ELSE NULL
  END
  WHERE e.user_id = auth.uid() AND e.course_id = v_course_id;

  RETURN jsonb_build_object(
    'completed', v_progress.completed,
    'completed_at', v_progress.completed_at,
    'progress_seconds', v_progress.progress_seconds,
    'updated_at', v_progress.updated_at,
    'completed_required_lessons', v_completed_required,
    'total_required_lessons', v_total_required,
    'course_completed', v_total_required > 0 AND v_completed_required = v_total_required
  );
END
$$;

REVOKE ALL ON FUNCTION public.record_lesson_progress(uuid, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_lesson_progress(uuid, boolean, integer) TO authenticated;
