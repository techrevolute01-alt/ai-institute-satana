CREATE POLICY profile_images_read_own
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY profile_images_insert_own
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY profile_images_update_own
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY profile_images_delete_own
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);
REVOKE ALL ON public.users FROM anon;
GRANT SELECT ON public.users TO authenticated;
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (full_name, mobile, avatar_url) ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
REVOKE ALL ON public.user_roles FROM anon;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS validity_days integer,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS packages_display_order_idx ON public.packages(display_order);
DROP POLICY IF EXISTS package_courses_read ON public.package_courses;
CREATE POLICY package_courses_read ON public.package_courses FOR SELECT
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.status = 'published')
      AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.status = 'published'))
);
CREATE TABLE public.package_includes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  included_package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, included_package_id),
  CHECK (package_id <> included_package_id)
);
GRANT SELECT ON public.package_includes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.package_includes TO authenticated;
GRANT ALL ON public.package_includes TO service_role;
ALTER TABLE public.package_includes ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_includes_read ON public.package_includes FOR SELECT USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.status = 'published')
      AND EXISTS (SELECT 1 FROM public.packages p WHERE p.id = included_package_id AND p.status = 'published'))
);
CREATE POLICY package_includes_admin ON public.package_includes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION private.prevent_package_cycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE r(id) AS (
      SELECT included_package_id FROM public.package_includes WHERE package_id = NEW.included_package_id
      UNION SELECT pi.included_package_id FROM public.package_includes pi JOIN r ON pi.package_id = r.id
    ) SELECT 1 FROM r WHERE id = NEW.package_id
  ) OR NEW.included_package_id = NEW.package_id THEN
    RAISE EXCEPTION 'Circular package inclusion is not allowed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER package_includes_no_cycle BEFORE INSERT OR UPDATE ON public.package_includes
FOR EACH ROW EXECUTE FUNCTION private.prevent_package_cycle();
CREATE INDEX package_includes_included_idx ON public.package_includes(included_package_id);
GRANT SELECT ON public.packages, public.courses, public.package_courses, public.package_includes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages, public.courses, public.package_courses, public.package_includes TO authenticated;
GRANT ALL ON public.packages, public.courses, public.package_courses, public.package_includes TO service_role;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon;
-- 1. Restore role column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'student';
-- remove duplicate data-less rows (same user, all now 'student') so uniqueness can be restored
DELETE FROM public.user_roles a USING public.user_roles b
 WHERE a.user_id = b.user_id AND a.role = b.role AND (a.created_at, a.id) > (b.created_at, b.id);
-- ensure every profile has the student role
INSERT INTO public.user_roles (user_id, role) SELECT id, 'student' FROM public.users ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Affiliate activation requests (own, pending only)
CREATE POLICY affiliate_profile_request ON public.affiliate_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND referral_code IS NULL);

-- 3. Promo codes: admins manage
CREATE POLICY promo_admin ON public.promo_codes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

-- 4. Withdrawal requests by approved affiliates, balance-checked in the database
CREATE POLICY payouts_request ON public.affiliate_payouts FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND EXISTS (SELECT 1 FROM public.affiliate_profiles a WHERE a.id = affiliate_id AND a.user_id = auth.uid() AND a.status = 'approved'));

CREATE OR REPLACE FUNCTION private.check_payout_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE avail numeric; pending numeric;
BEGIN
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than zero'; END IF;
  SELECT COALESCE(available_balance,0) INTO avail FROM public.affiliate_wallet WHERE affiliate_id = NEW.affiliate_id;
  SELECT COALESCE(sum(amount),0) INTO pending FROM public.affiliate_payouts WHERE affiliate_id = NEW.affiliate_id AND status = 'pending';
  IF NEW.amount > COALESCE(avail,0) - pending THEN RAISE EXCEPTION 'Withdrawal amount exceeds available balance'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER affiliate_payouts_balance BEFORE INSERT ON public.affiliate_payouts FOR EACH ROW EXECUTE FUNCTION private.check_payout_balance();
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