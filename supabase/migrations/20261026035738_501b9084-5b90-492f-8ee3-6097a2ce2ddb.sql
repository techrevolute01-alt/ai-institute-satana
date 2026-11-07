CREATE TYPE public.app_role AS ENUM ('student','affiliate','admin');
CREATE TYPE public.content_status AS ENUM ('draft','published','archived');
CREATE TYPE public.order_status AS ENUM ('pending','paid','cancelled','refunded');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;

CREATE TABLE public.users (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name text NOT NULL DEFAULT '', mobile text, avatar_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.users TO authenticated; GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own ON public.users FOR ALL TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
CREATE TRIGGER users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_own ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE TABLE public.courses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text NOT NULL UNIQUE, description text NOT NULL DEFAULT '', instructor text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', duration_minutes integer NOT NULL DEFAULT 0, level text NOT NULL DEFAULT 'Beginner', thumbnail_url text, status public.content_status NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.courses TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.courses TO authenticated; GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_public ON public.courses FOR SELECT USING (status='published' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY courses_admin ON public.courses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.packages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, description text NOT NULL DEFAULT '', original_price numeric(12,2) NOT NULL DEFAULT 0, selling_price numeric(12,2) NOT NULL DEFAULT 0, status public.content_status NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.packages TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.packages TO authenticated; GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY packages_public ON public.packages FOR SELECT USING (status='published' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY packages_admin ON public.packages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER packages_updated BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.package_courses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE, course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(package_id,course_id));
GRANT SELECT ON public.package_courses TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.package_courses TO authenticated; GRANT ALL ON public.package_courses TO service_role;
ALTER TABLE public.package_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_courses_read ON public.package_courses FOR SELECT USING (true); CREATE POLICY package_courses_admin ON public.package_courses FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.package_inclusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE, label text NOT NULL, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.package_inclusions TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.package_inclusions TO authenticated; GRANT ALL ON public.package_inclusions TO service_role;
ALTER TABLE public.package_inclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_inclusions_read ON public.package_inclusions FOR SELECT USING (true); CREATE POLICY package_inclusions_admin ON public.package_inclusions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.course_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE, title text NOT NULL, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.course_sections TO authenticated; GRANT ALL ON public.course_sections TO service_role;
ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY; CREATE POLICY sections_auth ON public.course_sections FOR SELECT TO authenticated USING (true); CREATE POLICY sections_admin ON public.course_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lessons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE, title text NOT NULL, video_path text, duration_minutes integer NOT NULL DEFAULT 0, is_preview boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.lessons TO authenticated; GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY; CREATE POLICY lessons_auth ON public.lessons FOR SELECT TO authenticated USING (true); CREATE POLICY lessons_admin ON public.lessons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lesson_resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE, title text NOT NULL, storage_path text NOT NULL, resource_type text NOT NULL DEFAULT 'document', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.lesson_resources TO authenticated; GRANT ALL ON public.lesson_resources TO service_role;
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY; CREATE POLICY resources_auth ON public.lesson_resources FOR SELECT TO authenticated USING (true); CREATE POLICY resources_admin ON public.lesson_resources FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.quizzes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE, title text NOT NULL, questions jsonb NOT NULL DEFAULT '[]', passing_score integer NOT NULL DEFAULT 70, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.quizzes TO authenticated; GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY; CREATE POLICY quizzes_auth ON public.quizzes FOR SELECT TO authenticated USING (true); CREATE POLICY quizzes_admin ON public.quizzes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), status public.order_status NOT NULL DEFAULT 'pending', total numeric(12,2) NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'USD', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.orders TO authenticated; GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; CREATE POLICY orders_own ON public.orders FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin')); CREATE POLICY orders_create ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());

CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, package_id uuid REFERENCES public.packages(id), course_id uuid REFERENCES public.courses(id), title text NOT NULL, amount numeric(12,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.order_items TO authenticated; GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY; CREATE POLICY order_items_own ON public.order_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND (o.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id), provider text, provider_reference text, amount numeric(12,2) NOT NULL, status text NOT NULL DEFAULT 'pending', paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.payments TO authenticated; GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY; CREATE POLICY payments_own ON public.payments FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND (o.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), course_id uuid NOT NULL REFERENCES public.courses(id), order_item_id uuid REFERENCES public.order_items(id), enrolled_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(user_id,course_id));
GRANT SELECT ON public.enrollments TO authenticated; GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY; CREATE POLICY enrollments_own ON public.enrollments FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lesson_progress (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), lesson_id uuid NOT NULL REFERENCES public.lessons(id), completed boolean NOT NULL DEFAULT false, progress_seconds integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,lesson_id));
GRANT SELECT,INSERT,UPDATE ON public.lesson_progress TO authenticated; GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY; CREATE POLICY progress_own ON public.lesson_progress FOR ALL TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.affiliate_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id), status text NOT NULL DEFAULT 'pending', referral_code text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.affiliate_profiles TO authenticated; GRANT ALL ON public.affiliate_profiles TO service_role; ALTER TABLE public.affiliate_profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY affiliate_profile_own ON public.affiliate_profiles FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.affiliate_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id), visitor_key text, landing_path text, created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.affiliate_clicks TO authenticated; GRANT ALL ON public.affiliate_clicks TO service_role; ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY; CREATE POLICY affiliate_clicks_own ON public.affiliate_clicks FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.affiliate_leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id), lead_key text, status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.affiliate_leads TO authenticated; GRANT ALL ON public.affiliate_leads TO service_role; ALTER TABLE public.affiliate_leads ENABLE ROW LEVEL SECURITY; CREATE POLICY affiliate_leads_own ON public.affiliate_leads FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.promo_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid REFERENCES public.affiliate_profiles(id), code text NOT NULL UNIQUE, discount_value numeric(12,2) NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.promo_codes TO authenticated; GRANT ALL ON public.promo_codes TO service_role; ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY; CREATE POLICY promo_own ON public.promo_codes FOR SELECT TO authenticated USING (affiliate_id IS NULL OR EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.promo_code_usage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id), order_id uuid NOT NULL REFERENCES public.orders(id), user_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.promo_code_usage TO authenticated; GRANT ALL ON public.promo_code_usage TO service_role; ALTER TABLE public.promo_code_usage ENABLE ROW LEVEL SECURITY; CREATE POLICY promo_usage_own ON public.promo_code_usage FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.affiliate_commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id), order_id uuid NOT NULL REFERENCES public.orders(id), amount numeric(12,2) NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.affiliate_commissions TO authenticated; GRANT ALL ON public.affiliate_commissions TO service_role; ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY; CREATE POLICY commissions_own ON public.affiliate_commissions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.affiliate_wallet (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid NOT NULL UNIQUE REFERENCES public.affiliate_profiles(id), available_balance numeric(12,2) NOT NULL DEFAULT 0, pending_balance numeric(12,2) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.affiliate_wallet TO authenticated; GRANT ALL ON public.affiliate_wallet TO service_role; ALTER TABLE public.affiliate_wallet ENABLE ROW LEVEL SECURITY; CREATE POLICY wallet_own ON public.affiliate_wallet FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.wallet_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid NOT NULL REFERENCES public.affiliate_wallet(id), amount numeric(12,2) NOT NULL, transaction_type text NOT NULL, reference_id uuid, created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.wallet_transactions TO authenticated; GRANT ALL ON public.wallet_transactions TO service_role; ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY; CREATE POLICY transactions_own ON public.wallet_transactions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_wallet w JOIN public.affiliate_profiles a ON a.id=w.affiliate_id WHERE w.id=wallet_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.affiliate_payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id), amount numeric(12,2) NOT NULL, status text NOT NULL DEFAULT 'pending', requested_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz); GRANT SELECT ON public.affiliate_payouts TO authenticated; GRANT ALL ON public.affiliate_payouts TO service_role; ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY; CREATE POLICY payouts_own ON public.affiliate_payouts FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.affiliate_profiles a WHERE a.id=affiliate_id AND (a.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.certificates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), course_id uuid NOT NULL REFERENCES public.courses(id), certificate_number text NOT NULL UNIQUE, issued_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.certificates TO authenticated; GRANT ALL ON public.certificates TO service_role; ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY; CREATE POLICY certificates_own ON public.certificates FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), title text NOT NULL, body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT,UPDATE ON public.notifications TO authenticated; GRANT ALL ON public.notifications TO service_role; ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY; CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin')); CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE TABLE public.refunds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id), payment_id uuid REFERENCES public.payments(id), amount numeric(12,2) NOT NULL, reason text, status text NOT NULL DEFAULT 'requested', created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.refunds TO authenticated; GRANT ALL ON public.refunds TO service_role; ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY; CREATE POLICY refunds_own ON public.refunds FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND (o.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES auth.users(id), action text NOT NULL, entity_type text NOT NULL, entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON public.audit_logs TO authenticated; GRANT ALL ON public.audit_logs TO service_role; ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY; CREATE POLICY audit_admin ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_courses_status ON public.courses(status); CREATE INDEX idx_packages_status ON public.packages(status); CREATE INDEX idx_orders_user ON public.orders(user_id); CREATE INDEX idx_enrollments_user ON public.enrollments(user_id); CREATE INDEX idx_progress_user ON public.lesson_progress(user_id); CREATE INDEX idx_affiliate_clicks_affiliate ON public.affiliate_clicks(affiliate_id); CREATE INDEX idx_commissions_affiliate ON public.affiliate_commissions(affiliate_id); CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('active','suspended','disabled'));

REVOKE INSERT, UPDATE, DELETE ON public.users FROM authenticated;
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (full_name, mobile, avatar_url) ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

DROP POLICY IF EXISTS users_own ON public.users;
CREATE POLICY users_read_own
ON public.users FOR SELECT TO authenticated
USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY users_update_own
ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
DROP POLICY IF EXISTS roles_own ON public.user_roles;
CREATE POLICY roles_read
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY roles_admin_insert
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY roles_admin_delete
ON public.user_roles FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, mobile, avatar_url, account_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'mobile', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

INSERT INTO public.users (id, full_name, email, mobile, avatar_url, account_status)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data ->> 'full_name', ''),
  au.email,
  NULLIF(au.raw_user_meta_data ->> 'mobile', ''),
  NULLIF(au.raw_user_meta_data ->> 'avatar_url', ''),
  'active'
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = now();

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'student'::public.app_role
FROM auth.users au
ON CONFLICT (user_id, role) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users(account_status);