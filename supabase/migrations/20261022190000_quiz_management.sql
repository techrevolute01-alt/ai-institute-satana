ALTER TABLE public.quizzes
  ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  ADD COLUMN section_id uuid REFERENCES public.course_sections(id) ON DELETE SET NULL,
  ADD COLUMN description text NOT NULL DEFAULT '',
  ADD COLUMN time_limit_minutes integer,
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN status text NOT NULL DEFAULT 'draft';

UPDATE public.quizzes AS q
SET course_id = s.course_id,
    section_id = s.id
FROM public.lessons AS l
JOIN public.course_sections AS s ON s.id = l.section_id
WHERE q.lesson_id = l.id
  AND q.course_id IS NULL;

ALTER TABLE public.quizzes
  ALTER COLUMN course_id SET NOT NULL,
  ALTER COLUMN lesson_id DROP NOT NULL,
  ADD CONSTRAINT quizzes_status_check CHECK (status IN ('draft', 'published', 'inactive')),
  ADD CONSTRAINT quizzes_passing_score_check CHECK (passing_score BETWEEN 0 AND 100),
  ADD CONSTRAINT quizzes_time_limit_check CHECK (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 1440),
  ADD CONSTRAINT quizzes_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 100);

CREATE INDEX quizzes_course_status_idx ON public.quizzes(course_id, status);

DROP POLICY IF EXISTS quizzes_auth ON public.quizzes;
DROP POLICY IF EXISTS quizzes_access ON public.quizzes;
DROP POLICY IF EXISTS quizzes_admin ON public.quizzes;
CREATE POLICY quizzes_admin ON public.quizzes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  questions_snapshot jsonb NOT NULL,
  passing_score_snapshot integer NOT NULL CHECK (passing_score_snapshot BETWEEN 0 AND 100),
  time_limit_minutes_snapshot integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  submitted_answers jsonb,
  score_obtained numeric(10,2),
  total_possible_marks numeric(10,2),
  percentage numeric(5,2),
  passed boolean,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'timed_out')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, student_id, attempt_number),
  CHECK (
    (status = 'in_progress' AND submitted_at IS NULL AND submitted_answers IS NULL
      AND score_obtained IS NULL AND total_possible_marks IS NULL AND percentage IS NULL AND passed IS NULL)
    OR
    (status IN ('submitted', 'timed_out') AND submitted_at IS NOT NULL AND submitted_answers IS NOT NULL
      AND score_obtained IS NOT NULL AND total_possible_marks IS NOT NULL AND percentage IS NOT NULL AND passed IS NOT NULL)
  )
);

CREATE INDEX quiz_attempts_student_quiz_idx
  ON public.quiz_attempts(student_id, quiz_id, attempt_number DESC);
CREATE UNIQUE INDEX quiz_attempts_one_active_idx
  ON public.quiz_attempts(student_id, quiz_id)
  WHERE status = 'in_progress';

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;

CREATE OR REPLACE FUNCTION private.validate_quiz_questions(_questions jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_question jsonb;
  v_option jsonb;
  v_index integer := 0;
  v_total numeric := 0;
  v_marks numeric;
  v_option_count integer;
  v_correct_count integer;
  v_question_ids text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(jsonb_typeof(_questions), 'null') <> 'array' THEN
    RAISE EXCEPTION 'A quiz must contain at least one question.';
  END IF;
  IF jsonb_array_length(_questions) = 0 THEN
    RAISE EXCEPTION 'A quiz must contain at least one question.';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(_questions)
  LOOP
    IF v_index >= 500
      OR COALESCE(jsonb_typeof(v_question->'id'), 'null') <> 'string'
      OR COALESCE(jsonb_typeof(v_question->'text'), 'null') <> 'string'
      OR COALESCE(btrim(v_question->>'id'), '') = ''
      OR COALESCE(btrim(v_question->>'text'), '') = ''
      OR length(v_question->>'text') > 2000
      OR (v_question->>'id') = ANY(v_question_ids)
      OR COALESCE(jsonb_typeof(v_question->'marks'), 'null') <> 'number'
      OR COALESCE(jsonb_typeof(v_question->'display_order'), 'null') <> 'number'
      OR (v_question ? 'explanation' AND COALESCE(jsonb_typeof(v_question->'explanation'), 'null') <> 'string')
      OR length(COALESCE(v_question->>'explanation', '')) > 2000
      OR (v_question->>'display_order')::numeric <> v_index
    THEN
      RAISE EXCEPTION 'Each question needs text, positive marks, and a valid display order.';
    END IF;
    v_marks := (v_question->>'marks')::numeric;
    IF v_marks <= 0 OR v_marks = 'NaN'::numeric OR v_marks > 10000 OR v_marks <> round(v_marks, 2) THEN
      RAISE EXCEPTION 'Question marks must be positive and use at most two decimal places.';
    END IF;
    v_question_ids := array_append(v_question_ids, v_question->>'id');
    v_total := v_total + v_marks;

    IF v_question->>'type' = 'single_choice' THEN
      IF COALESCE(jsonb_typeof(v_question->'options'), 'null') <> 'array' THEN
        RAISE EXCEPTION 'Multiple-choice questions need at least two options.';
      END IF;
      SELECT count(*), count(*) FILTER (WHERE option->>'id' = v_question->>'correct_option_id')
        INTO v_option_count, v_correct_count
      FROM jsonb_array_elements(v_question->'options') AS options(option);
      IF v_option_count < 2 OR v_option_count > 20 OR v_correct_count <> 1
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_question->'options') AS options(option)
          WHERE COALESCE(jsonb_typeof(option->'id'), 'null') <> 'string'
            OR COALESCE(jsonb_typeof(option->'text'), 'null') <> 'string'
            OR COALESCE(btrim(option->>'id'), '') = ''
            OR COALESCE(btrim(option->>'text'), '') = ''
            OR length(option->>'text') > 500
        )
        OR v_option_count <> (
          SELECT count(DISTINCT option->>'id')
          FROM jsonb_array_elements(v_question->'options') AS options(option)
        ) THEN
        RAISE EXCEPTION 'Each multiple-choice question needs two or more non-empty options and one correct option.';
      END IF;
    ELSIF v_question->>'type' = 'true_false' THEN
      IF COALESCE(jsonb_typeof(v_question->'correct_answer'), 'null') <> 'boolean' THEN
        RAISE EXCEPTION 'True/False questions need one correct answer.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported question type.';
    END IF;
    v_index := v_index + 1;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'A quiz must have positive total marks.';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION private.validate_quiz_questions(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.validate_published_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW.section_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.course_sections s
    WHERE s.id = NEW.section_id AND s.course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'The selected section must belong to the quiz course.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.course_id, NEW.section_id, NEW.title, NEW.description, NEW.questions,
      NEW.passing_score, NEW.time_limit_minutes, NEW.max_attempts
    ) IS DISTINCT FROM ROW(
      OLD.course_id, OLD.section_id, OLD.title, OLD.description, OLD.questions,
      OLD.passing_score, OLD.time_limit_minutes, OLD.max_attempts
    ) AND EXISTS (
      SELECT 1 FROM public.quiz_attempts a
      WHERE a.quiz_id = OLD.id AND a.status = 'in_progress'
    ) THEN
      RAISE EXCEPTION 'This quiz cannot be changed while a student has an attempt in progress.';
    END IF;
  END IF;
  IF NEW.status = 'published' THEN
    PERFORM private.validate_quiz_questions(NEW.questions);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER quizzes_validate_published
  BEFORE INSERT OR UPDATE OF
    status, questions, course_id, section_id, title, description,
    passing_score, time_limit_minutes, max_attempts
  ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION private.validate_published_quiz();

CREATE OR REPLACE FUNCTION private.quiz_public_questions(_questions jsonb, _include_explanations boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', question->>'id',
        'type', question->>'type',
        'text', question->>'text',
        'marks', question->'marks',
        'display_order', question->'display_order'
      )
      || CASE
        WHEN question->>'type' = 'single_choice' THEN jsonb_build_object(
          'options',
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', option->>'id', 'text', option->>'text') ORDER BY option_order)
            FROM jsonb_array_elements(question->'options') WITH ORDINALITY AS options(option, option_order)
          ), '[]'::jsonb)
        )
        ELSE '{}'::jsonb
      END
      || CASE
        WHEN _include_explanations AND COALESCE(question->>'explanation', '') <> ''
          THEN jsonb_build_object('explanation', question->>'explanation')
        ELSE '{}'::jsonb
      END
      ORDER BY question_order
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(_questions) WITH ORDINALITY AS questions(question, question_order)
$$;
REVOKE ALL ON FUNCTION private.quiz_public_questions(jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_student_quizzes(_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT private.has_course_access(auth.uid(), _course_id)
    OR NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = _course_id AND c.status = 'published') THEN
    RAISE EXCEPTION 'You do not have access to this course.';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'title', q.title,
      'description', q.description,
      'passing_percentage', q.passing_score,
      'time_limit_minutes', q.time_limit_minutes,
      'max_attempts', q.max_attempts,
      'status', q.status,
      'section_id', q.section_id,
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id,
          'attempt_number', a.attempt_number,
          'started_at', a.started_at,
          'submitted_at', a.submitted_at,
          'score_obtained', a.score_obtained,
          'total_possible_marks', a.total_possible_marks,
          'percentage', a.percentage,
          'passed', a.passed,
          'status', a.status
        ) ORDER BY a.attempt_number DESC)
        FROM public.quiz_attempts a
        WHERE a.quiz_id = q.id AND a.student_id = auth.uid()
      ), '[]'::jsonb)
    ) ORDER BY q.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.quizzes q
  WHERE q.course_id = _course_id AND q.status = 'published';

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.start_quiz_attempt(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_attempt public.quiz_attempts%ROWTYPE;
  v_completed integer;
  v_attempt_number integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF NOT FOUND OR v_quiz.status <> 'published'
    OR NOT private.has_course_access(auth.uid(), v_quiz.course_id)
    OR NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = v_quiz.course_id AND c.status = 'published') THEN
    RAISE EXCEPTION 'This quiz is unavailable or you do not have course access.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || _quiz_id::text, 0));

  UPDATE public.quiz_attempts
  SET status = 'timed_out',
      submitted_at = now(),
      submitted_answers = '{}'::jsonb,
      score_obtained = 0,
      total_possible_marks = 0,
      percentage = 0,
      passed = false
  WHERE quiz_id = _quiz_id AND student_id = auth.uid() AND status = 'in_progress'
    AND v_quiz.time_limit_minutes IS NOT NULL
    AND started_at + make_interval(mins => v_quiz.time_limit_minutes) <= now();

  SELECT count(*) INTO v_completed
  FROM public.quiz_attempts
  WHERE quiz_id = _quiz_id AND student_id = auth.uid() AND status = 'submitted';
  IF v_completed >= v_quiz.max_attempts THEN
    RAISE EXCEPTION 'You have used all allowed attempts for this quiz.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quiz_attempts
    WHERE quiz_id = _quiz_id AND student_id = auth.uid() AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'You already have an attempt in progress.';
  END IF;

  SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt_number
  FROM public.quiz_attempts
  WHERE quiz_id = _quiz_id AND student_id = auth.uid();

  INSERT INTO public.quiz_attempts(
    quiz_id, student_id, attempt_number, questions_snapshot,
    passing_score_snapshot, time_limit_minutes_snapshot
  )
  VALUES (
    _quiz_id, auth.uid(), v_attempt_number, v_quiz.questions,
    v_quiz.passing_score, v_quiz.time_limit_minutes
  )
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_number', v_attempt.attempt_number,
    'started_at', v_attempt.started_at,
    'description', v_quiz.description,
    'time_limit_minutes', v_attempt.time_limit_minutes_snapshot,
    'questions', private.quiz_public_questions(v_attempt.questions_snapshot)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_attempt_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_attempt public.quiz_attempts%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
  v_quiz_id uuid;
  v_question jsonb;
  v_selected jsonb;
  v_score numeric := 0;
  v_total numeric := 0;
  v_percentage numeric(5,2);
  v_completed integer;
  v_is_correct boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF jsonb_typeof(_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be submitted as an object.';
  END IF;

  SELECT quiz_id INTO v_quiz_id
  FROM public.quiz_attempts
  WHERE id = _attempt_id AND student_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz attempt not found.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || v_quiz_id::text, 0));
  SELECT * INTO v_attempt FROM public.quiz_attempts
  WHERE id = _attempt_id AND student_id = auth.uid()
  FOR UPDATE;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_attempt.quiz_id;
  IF NOT private.has_course_access(auth.uid(), v_quiz.course_id) THEN
    RAISE EXCEPTION 'You no longer have access to this course.';
  END IF;
  IF v_attempt.status = 'submitted' THEN
    RETURN jsonb_build_object(
      'attempt_id', v_attempt.id,
      'score_obtained', v_attempt.score_obtained,
      'total_possible_marks', v_attempt.total_possible_marks,
      'percentage', v_attempt.percentage,
      'passed', v_attempt.passed,
      'status', v_attempt.status
    );
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'This attempt is no longer active.';
  END IF;

  IF v_attempt.time_limit_minutes_snapshot IS NOT NULL
    AND v_attempt.started_at + make_interval(mins => v_attempt.time_limit_minutes_snapshot) <= now() THEN
    UPDATE public.quiz_attempts
    SET status = 'timed_out', submitted_at = now(), submitted_answers = _answers,
        score_obtained = 0, total_possible_marks = 0, percentage = 0, passed = false
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('status', 'timed_out', 'message', 'The time limit has expired.');
  END IF;

  SELECT count(*) INTO v_completed
  FROM public.quiz_attempts
  WHERE quiz_id = v_quiz.id AND student_id = auth.uid() AND status = 'submitted';
  IF v_completed >= v_quiz.max_attempts THEN
    RAISE EXCEPTION 'You have used all allowed attempts for this quiz.';
  END IF;

  IF jsonb_object_length(_answers) <> jsonb_array_length(v_attempt.questions_snapshot) THEN
    RAISE EXCEPTION 'Answer every question before submitting.';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_attempt.questions_snapshot)
  LOOP
    v_selected := _answers -> (v_question->>'id');
    IF v_selected IS NULL THEN
      RAISE EXCEPTION 'Answer every question before submitting.';
    END IF;
    IF v_question->>'type' = 'single_choice' THEN
      IF jsonb_typeof(v_selected) <> 'string' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_question->'options') AS options(option)
        WHERE option->>'id' = v_selected #>> '{}'
      ) THEN
        RAISE EXCEPTION 'A submitted answer is invalid.';
      END IF;
      v_is_correct := v_selected #>> '{}' = v_question->>'correct_option_id';
    ELSE
      IF jsonb_typeof(v_selected) <> 'boolean' THEN
        RAISE EXCEPTION 'A submitted answer is invalid.';
      END IF;
      v_is_correct := v_selected = v_question->'correct_answer';
    END IF;

    v_total := v_total + (v_question->>'marks')::numeric;
    IF v_is_correct THEN
      v_score := v_score + (v_question->>'marks')::numeric;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'This quiz has invalid total marks and cannot be graded.';
  END IF;
  v_percentage := round(v_score / v_total * 100, 2);

  UPDATE public.quiz_attempts
  SET submitted_at = now(),
      submitted_answers = _answers,
      score_obtained = v_score,
      total_possible_marks = v_total,
      percentage = v_percentage,
      passed = v_percentage >= v_attempt.passing_score_snapshot,
      status = 'submitted'
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'score_obtained', v_attempt.score_obtained,
    'total_possible_marks', v_attempt.total_possible_marks,
    'percentage', v_attempt.percentage,
    'passed', v_attempt.passed,
    'status', v_attempt.status
  );
END
$$;

CREATE OR REPLACE FUNCTION public.resume_quiz_attempt(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_attempt public.quiz_attempts%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  SELECT * INTO v_attempt FROM public.quiz_attempts
  WHERE id = _attempt_id AND student_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Active quiz attempt not found.';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_attempt.quiz_id;
  IF v_quiz.status <> 'published'
    OR NOT private.has_course_access(auth.uid(), v_quiz.course_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.courses c WHERE c.id = v_quiz.course_id AND c.status = 'published'
    ) THEN
    RAISE EXCEPTION 'This quiz is unavailable or you no longer have course access.';
  END IF;
  IF v_attempt.time_limit_minutes_snapshot IS NOT NULL
    AND v_attempt.started_at + make_interval(mins => v_attempt.time_limit_minutes_snapshot) <= now() THEN
    UPDATE public.quiz_attempts
    SET status = 'timed_out', submitted_at = now(), submitted_answers = '{}'::jsonb,
        score_obtained = 0, total_possible_marks = 0, percentage = 0, passed = false
    WHERE id = v_attempt.id;
    RETURN jsonb_build_object('status', 'timed_out', 'message', 'The time limit has expired.');
  END IF;
  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_number', v_attempt.attempt_number,
    'started_at', v_attempt.started_at,
    'description', v_quiz.description,
    'time_limit_minutes', v_attempt.time_limit_minutes_snapshot,
    'questions', private.quiz_public_questions(v_attempt.questions_snapshot)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.get_quiz_attempt_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_attempt public.quiz_attempts%ROWTYPE;
  v_quiz public.quizzes%ROWTYPE;
  v_feedback jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  SELECT * INTO v_attempt FROM public.quiz_attempts
  WHERE id = _attempt_id AND student_id = auth.uid();
  IF NOT FOUND OR v_attempt.status <> 'submitted' THEN
    RAISE EXCEPTION 'Submitted quiz result not found.';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_attempt.quiz_id;
  IF NOT private.has_course_access(auth.uid(), v_quiz.course_id) THEN
    RAISE EXCEPTION 'You no longer have access to this course.';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'question_id', question->>'id',
      'question', question->>'text',
      'selected_answer', v_attempt.submitted_answers -> (question->>'id'),
      'correct_answer', CASE
        WHEN question->>'type' = 'single_choice' THEN to_jsonb(question->>'correct_option_id')
        ELSE question->'correct_answer'
      END,
      'options', CASE
        WHEN question->>'type' = 'single_choice' THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', option->>'id', 'text', option->>'text') ORDER BY option_order)
          FROM jsonb_array_elements(question->'options') WITH ORDINALITY AS options(option, option_order)
        ), '[]'::jsonb)
        ELSE '[]'::jsonb
      END,
      'is_correct', CASE
        WHEN question->>'type' = 'single_choice'
          THEN v_attempt.submitted_answers ->> (question->>'id') = question->>'correct_option_id'
        ELSE v_attempt.submitted_answers -> (question->>'id') = question->'correct_answer'
      END,
      'explanation', question->>'explanation'
    ) ORDER BY question_order
  ), '[]'::jsonb)
  INTO v_feedback
  FROM jsonb_array_elements(v_attempt.questions_snapshot) WITH ORDINALITY AS questions(question, question_order);

  RETURN jsonb_build_object(
    'attempt_id', v_attempt.id,
    'attempt_number', v_attempt.attempt_number,
    'submitted_at', v_attempt.submitted_at,
    'score_obtained', v_attempt.score_obtained,
    'total_possible_marks', v_attempt.total_possible_marks,
    'percentage', v_attempt.percentage,
    'passed', v_attempt.passed,
    'feedback', v_feedback
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_student_quizzes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_quiz_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_quiz_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quiz_attempt_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_quizzes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_quiz_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quiz_attempt_result(uuid) TO authenticated;
