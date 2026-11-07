-- Razorpay TEST MODE checkout only. This migration is additive and does not
-- change course-access rules or allow test payments to earn affiliate commissions.

DO $$
BEGIN
  IF to_regprocedure('private.guard_verified_payment()') IS NULL
     OR to_regprocedure('private.guard_paid_order_access()') IS NULL
     OR to_regprocedure('private.record_affiliate_commission_for_payment()') IS NULL
     OR to_regprocedure('private.has_paid_package_course_access(uuid,uuid)') IS NULL
     OR to_regprocedure('private.has_course_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Apply and verify 20261104190000_affiliate_commission_settings.sql before this migration';
  END IF;
  IF position(
       'payment_mode = ''live'''
       IN lower(pg_get_functiondef(
         to_regprocedure('private.has_paid_package_course_access(uuid,uuid)')
       ))
     ) = 0
     OR position(
       'payment_mode = ''live'''
       IN lower(pg_get_functiondef(
         to_regprocedure('private.has_course_access(uuid,uuid)')
       ))
     ) = 0 THEN
    RAISE EXCEPTION
      'Apply and verify the live-payment-only course access functions from 20261104190000_affiliate_commission_settings.sql';
  END IF;
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.payments') IS NULL
     OR to_regclass('public.packages') IS NULL
     OR to_regclass('public.promo_codes') IS NULL
     OR to_regclass('public.promo_code_usage') IS NULL
     OR to_regclass('public.affiliate_profiles') IS NULL
     OR to_regclass('public.affiliate_commissions') IS NULL
     OR to_regclass('public.affiliate_wallet') IS NULL
     OR to_regclass('public.wallet_transactions') IS NULL
     OR to_regtype('public.order_status') IS NULL
     OR EXISTS (
       SELECT required.table_name, required.column_name
       FROM (VALUES
         ('orders', 'user_id'),
         ('orders', 'status'),
         ('orders', 'total'),
         ('orders', 'currency'),
         ('orders', 'updated_at'),
         ('orders', 'promo_code_id'),
         ('orders', 'affiliate_id'),
         ('order_items', 'order_id'),
         ('order_items', 'package_id'),
         ('order_items', 'title'),
         ('order_items', 'amount'),
         ('payments', 'order_id'),
         ('payments', 'provider'),
         ('payments', 'provider_reference'),
         ('payments', 'amount'),
         ('payments', 'status'),
         ('payments', 'paid_at'),
         ('payments', 'payment_mode'),
         ('packages', 'id'),
         ('packages', 'slug'),
         ('packages', 'name'),
         ('packages', 'status'),
         ('packages', 'original_price'),
         ('packages', 'selling_price'),
         ('promo_codes', 'id'),
         ('promo_codes', 'code'),
         ('promo_codes', 'active'),
         ('promo_codes', 'discount_value'),
         ('promo_codes', 'discount_type'),
         ('promo_codes', 'expires_at'),
         ('promo_codes', 'usage_limit'),
         ('promo_codes', 'affiliate_id'),
         ('promo_code_usage', 'promo_code_id'),
         ('promo_code_usage', 'order_id'),
         ('promo_code_usage', 'user_id'),
         ('affiliate_profiles', 'id'),
         ('affiliate_profiles', 'user_id'),
         ('affiliate_profiles', 'status'),
         ('packages', 'commission_type'),
         ('packages', 'commission_value'),
         ('affiliate_commissions', 'payment_id'),
         ('affiliate_commissions', 'order_item_id'),
         ('affiliate_commissions', 'commission_type'),
         ('affiliate_commissions', 'commission_value'),
         ('affiliate_commissions', 'payment_amount'),
         ('affiliate_commissions', 'gross_amount'),
         ('affiliate_commissions', 'refunded_amount'),
         ('affiliate_commissions', 'paid_amount'),
         ('affiliate_commissions', 'recovered_amount'),
         ('affiliate_commissions', 'recovery_due'),
         ('affiliate_wallet', 'recovery_balance'),
         ('wallet_transactions', 'ledger_account')
       ) AS required(table_name, column_name)
       WHERE NOT EXISTS (
         SELECT 1
         FROM information_schema.columns actual
         WHERE actual.table_schema = 'public'
           AND actual.table_name = required.table_name
           AND actual.column_name = required.column_name
       )
     ) THEN
    RAISE EXCEPTION
      'Apply and verify the package, order, promo-code, affiliate, and payment schema migrations before this migration';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_enum
    WHERE enumtypid = to_regtype('public.order_status')
      AND enumlabel IN ('pending', 'paid', 'cancelled')
  ) <> 3 THEN
    RAISE EXCEPTION
      'The public.order_status enum must include pending, paid, and cancelled before this migration';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_verified_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'A successful payment cannot be downgraded or changed';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only the payment verification service may mark a payment paid';
    END IF;
    IF NEW.payment_mode = 'test' THEN
      IF lower(coalesce(NEW.provider, '')) <> 'razorpay' THEN
        RAISE EXCEPTION 'Only Razorpay TEST payments may use test payment mode';
      END IF;
    ELSIF NEW.payment_mode IS DISTINCT FROM 'live'
       OR lower(coalesce(NEW.provider, '')) = 'demo' THEN
      RAISE EXCEPTION 'A verified live payment is required';
    END IF;
    IF NEW.provider_reference IS NULL OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'A verified payment reference and positive amount are required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_verified_payment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_paid_order_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'paid'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the verified payment service may change a paid order status';
  END IF;

  IF NEW.status = 'paid' THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Only the verified payment service may change a paid order status';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.order_id = NEW.id
        AND p.status = 'paid'
        AND p.provider_reference IS NOT NULL
        AND p.amount = NEW.total
        AND (
          (
            p.payment_mode = 'live'
            AND lower(coalesce(p.provider, '')) <> 'demo'
          )
          OR (
            p.payment_mode = 'test'
            AND lower(coalesce(p.provider, '')) = 'razorpay'
          )
        )
    ) THEN
      RAISE EXCEPTION 'A verified payment matching the order total is required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_paid_order_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_guard_verified_payment ON public.payments;
CREATE TRIGGER payments_guard_verified_payment
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_verified_payment();

DROP TRIGGER IF EXISTS orders_guard_paid_access ON public.orders;
CREATE TRIGGER orders_guard_paid_access
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_order_access();

CREATE OR REPLACE FUNCTION private.record_razorpay_test_order_for_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _item_count bigint;
  _item_total numeric(12,2);
BEGIN
  IF NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Test payment verification requires the server service role';
  END IF;
  IF NEW.payment_mode IS DISTINCT FROM 'test'
     OR lower(coalesce(NEW.provider, '')) <> 'razorpay'
     OR NEW.provider_reference IS NULL
     OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A verified Razorpay TEST payment is required';
  END IF;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = NEW.order_id
  FOR UPDATE;
  IF NOT FOUND OR NEW.amount <> _order.total OR _order.currency <> 'INR' THEN
    RAISE EXCEPTION 'Verified test payment does not match the package order';
  END IF;

  SELECT count(*), coalesce(sum(amount), 0)
  INTO _item_count, _item_total
  FROM public.order_items
  WHERE order_id = NEW.order_id;
  IF _item_count = 0 OR _item_total <= 0 OR _item_total <> _order.total
     OR EXISTS (
       SELECT 1 FROM public.order_items
       WHERE order_id = NEW.order_id AND amount < 0
     ) THEN
    RAISE EXCEPTION 'Order items do not reconcile to the verified test payment';
  END IF;

  UPDATE public.orders
  SET status = 'paid', updated_at = now()
  WHERE id = _order.id AND status <> 'paid';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_razorpay_test_order_for_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_record_affiliate_commission ON public.payments;
CREATE TRIGGER payments_record_affiliate_commission
  AFTER INSERT OR UPDATE OF status, payment_mode, amount, order_id ON public.payments
  FOR EACH ROW
  WHEN (NEW.payment_mode IS DISTINCT FROM 'test')
  EXECUTE FUNCTION private.record_affiliate_commission_for_payment();

DROP TRIGGER IF EXISTS payments_record_razorpay_test_order ON public.payments;
CREATE TRIGGER payments_record_razorpay_test_order
  AFTER INSERT OR UPDATE OF status, payment_mode, amount, order_id ON public.payments
  FOR EACH ROW
  WHEN (NEW.payment_mode = 'test' AND NEW.status = 'paid')
  EXECUTE FUNCTION private.record_razorpay_test_order_for_payment();

-- PostgreSQL cannot rename existing input parameters through CREATE OR REPLACE.
-- Drop only these RPC functions so their argument names match the server calls.
DROP FUNCTION IF EXISTS public.create_razorpay_test_order(uuid, text, text);
CREATE FUNCTION public.create_razorpay_test_order(
  _user_id uuid,
  _package_slug text,
  _promo_code text
)
RETURNS TABLE (
  order_id uuid,
  payment_id uuid,
  total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _package public.packages%ROWTYPE;
  _promo public.promo_codes%ROWTYPE;
  _affiliate_user_id uuid;
  _used_count bigint;
  _payable numeric(12,2);
  _new_order_id uuid;
  _new_payment_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Razorpay TEST checkout requires the server service role';
  END IF;
  IF _user_id IS NULL OR NULLIF(trim(_package_slug), '') IS NULL THEN
    RAISE EXCEPTION 'A user and package are required';
  END IF;

  SELECT * INTO _package
  FROM public.packages
  WHERE slug = _package_slug AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This package is not available for checkout';
  END IF;
  IF _package.original_price < 0
     OR _package.selling_price < 0
     OR _package.selling_price > _package.original_price THEN
    RAISE EXCEPTION 'This package has invalid pricing';
  END IF;

  -- A valid promo uses the selling price; no promo uses the original price.
  _payable := _package.original_price;
  IF NULLIF(upper(trim(_promo_code)), '') IS NOT NULL THEN
    SELECT * INTO _promo
    FROM public.promo_codes
    WHERE code = upper(trim(_promo_code))
    FOR UPDATE;
    IF NOT FOUND OR NOT _promo.active THEN
      RAISE EXCEPTION 'This promo code is invalid or inactive';
    END IF;
    IF _promo.expires_at IS NOT NULL AND _promo.expires_at <= now() THEN
      RAISE EXCEPTION 'This promo code has expired';
    END IF;
    IF _promo.usage_limit IS NOT NULL THEN
      SELECT count(*) INTO _used_count
      FROM public.promo_code_usage
      WHERE promo_code_id = _promo.id;
      IF _used_count >= _promo.usage_limit THEN
        RAISE EXCEPTION 'This promo code has reached its usage limit';
      END IF;
    END IF;
    IF _promo.affiliate_id IS NOT NULL THEN
      SELECT user_id INTO _affiliate_user_id
      FROM public.affiliate_profiles
      WHERE id = _promo.affiliate_id AND status = 'approved';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'This affiliate promo code is not currently eligible';
      END IF;
      IF _affiliate_user_id = _user_id THEN
        RAISE EXCEPTION 'You cannot use your own affiliate promo code';
      END IF;
    END IF;
    IF _promo.discount_value IS NULL
       OR _promo.discount_value <= 0
       OR _promo.discount_type IS NULL
       OR _promo.discount_type NOT IN ('fixed', 'percentage')
       OR (_promo.discount_type = 'percentage' AND _promo.discount_value > 100) THEN
      RAISE EXCEPTION 'This promo code does not have a valid discount';
    END IF;

    -- Promo value validates the code but is not subtracted from the selling price.
    _payable := _package.selling_price;
  END IF;

  INSERT INTO public.orders (
    user_id, status, total, currency, promo_code_id, affiliate_id
  )
  VALUES (
    _user_id,
    'pending',
    _payable,
    'INR',
    CASE WHEN _promo.id IS NOT NULL THEN _promo.id ELSE NULL END,
    CASE WHEN _promo.id IS NOT NULL THEN _promo.affiliate_id ELSE NULL END
  )
  RETURNING id INTO _new_order_id;

  INSERT INTO public.order_items (order_id, package_id, title, amount)
  VALUES (_new_order_id, _package.id, _package.name, _payable);

  INSERT INTO public.payments (
    order_id, provider, payment_mode, provider_reference, amount, status, paid_at
  )
  VALUES (
    _new_order_id,
    'razorpay',
    'test',
    NULL,
    _payable,
    'pending',
    NULL
  )
  RETURNING id INTO _new_payment_id;

  RETURN QUERY SELECT _new_order_id, _new_payment_id, _payable;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_razorpay_test_payment(uuid, uuid, text, text);
CREATE FUNCTION public.complete_razorpay_test_payment(
  _payment_id uuid,
  _user_id uuid,
  _razorpay_order_id text,
  _razorpay_payment_id text
)
RETURNS TABLE (
  order_id uuid,
  payment_id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _payment public.payments%ROWTYPE;
  _order public.orders%ROWTYPE;
  _promo public.promo_codes%ROWTYPE;
  _used_count bigint;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Razorpay payment verification requires the server service role';
  END IF;
  IF NULLIF(_razorpay_order_id, '') IS NULL
     OR NULLIF(_razorpay_payment_id, '') IS NULL THEN
    RAISE EXCEPTION 'Razorpay order and payment references are required';
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;
  IF NOT FOUND
     OR _payment.provider IS DISTINCT FROM 'razorpay'
     OR _payment.payment_mode IS DISTINCT FROM 'test' THEN
    RAISE EXCEPTION 'Razorpay TEST payment was not found';
  END IF;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = _payment.order_id
  FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> _user_id THEN
    RAISE EXCEPTION 'Payment does not belong to this user';
  END IF;
  IF _payment.amount <> _order.total OR _order.currency <> 'INR' THEN
    RAISE EXCEPTION 'Payment amount does not match the package order';
  END IF;

  IF _payment.status = 'paid'
     AND _payment.provider_reference = _razorpay_payment_id
     AND _order.status = 'paid' THEN
    RETURN QUERY SELECT _order.id, _payment.id, _payment.status;
    RETURN;
  END IF;
  IF _payment.status <> 'pending'
     OR _payment.provider_reference IS DISTINCT FROM _razorpay_order_id THEN
    RAISE EXCEPTION 'Payment is not pending for this Razorpay order';
  END IF;

  IF _order.promo_code_id IS NOT NULL THEN
    SELECT * INTO _promo
    FROM public.promo_codes
    WHERE id = _order.promo_code_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The promo code for this order no longer exists';
    END IF;
    IF _promo.usage_limit IS NOT NULL THEN
      SELECT count(*) INTO _used_count
      FROM public.promo_code_usage
      WHERE promo_code_id = _promo.id;
      IF _used_count >= _promo.usage_limit THEN
        RAISE EXCEPTION 'This promo code has reached its usage limit';
      END IF;
    END IF;
  END IF;

  UPDATE public.payments
  SET status = 'paid',
      provider_reference = _razorpay_payment_id,
      paid_at = now()
  WHERE id = _payment.id;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = _payment.order_id;
  IF _order.promo_code_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.promo_code_usage
       WHERE promo_code_id = _order.promo_code_id
         AND order_id = _order.id
     ) THEN
    INSERT INTO public.promo_code_usage (promo_code_id, order_id, user_id)
    VALUES (_order.promo_code_id, _order.id, _order.user_id);
  END IF;
  RETURN QUERY SELECT _order.id, _payment.id, 'paid'::text;
END;
$$;

DROP FUNCTION IF EXISTS public.cancel_razorpay_test_order(uuid, uuid, text);
CREATE FUNCTION public.cancel_razorpay_test_order(
  _payment_id uuid,
  _user_id uuid,
  _payment_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _payment public.payments%ROWTYPE;
  _order public.orders%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Razorpay TEST payment updates require the server service role';
  END IF;
  IF _payment_status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid Razorpay test payment status';
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;
  IF NOT FOUND
     OR _payment.provider IS DISTINCT FROM 'razorpay'
     OR _payment.payment_mode IS DISTINCT FROM 'test' THEN
    RAISE EXCEPTION 'Razorpay TEST payment was not found';
  END IF;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = _payment.order_id
  FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> _user_id THEN
    RAISE EXCEPTION 'Payment does not belong to this user';
  END IF;
  IF _payment.status = _payment_status AND _order.status = 'cancelled' THEN
    RETURN _payment.status;
  END IF;
  IF _payment.status <> 'pending' OR _order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending Razorpay TEST payment can be cancelled';
  END IF;

  UPDATE public.payments
  SET status = _payment_status
  WHERE id = _payment.id;
  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = _order.id;
  RETURN _payment_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_razorpay_test_order(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_razorpay_test_payment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_razorpay_test_order(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_razorpay_test_order(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_razorpay_test_payment(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_razorpay_test_order(uuid, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
