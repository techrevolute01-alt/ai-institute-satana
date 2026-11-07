-- 1. Restore role column
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'student';
-- remove duplicate data-less rows (same user, all now 'student') so uniqueness can be restored
DELETE FROM public.user_roles a USING public.user_roles b
 WHERE a.user_id = b.user_id AND a.role = b.role AND (a.created_at, a.id) > (b.created_at, b.id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
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