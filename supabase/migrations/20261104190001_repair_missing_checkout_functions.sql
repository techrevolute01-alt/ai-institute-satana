-- Repair the checkout functions required by 20261107120000_razorpay_test_checkout.sql.
-- Apply only after the package checkout and affiliate schema migrations.
-- This migration does not alter customer, wallet, commission, or ledger rows.

DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.payments') IS NULL
     OR to_regclass('public.packages') IS NULL
     OR to_regclass('public.promo_codes') IS NULL
     OR to_regclass('public.affiliate_profiles') IS NULL
     OR to_regclass('public.affiliate_commissions') IS NULL
     OR to_regclass('public.affiliate_wallet') IS NULL
     OR to_regclass('public.wallet_transactions') IS NULL THEN
    RAISE EXCEPTION
      'Apply the existing package checkout and affiliate schema migrations before this repair';
  END IF;

  IF to_regprocedure('private.has_role(uuid,public.app_role)') IS NULL
     OR to_regprocedure('private.has_paid_package_course_access(uuid,uuid)') IS NULL
     OR to_regprocedure('private.has_course_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Apply the existing course-access and affiliate migrations before this repair';
  END IF;
  IF to_regclass('public.affiliate_commissions_order_item_unique') IS NULL THEN
    RAISE EXCEPTION
      'Apply the affiliate commission schema migration, including its order-item unique index, before this repair';
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
      'The existing course-access functions must restrict package access to verified LIVE payments';
  END IF;

  IF EXISTS (
    SELECT required.table_name, required.column_name
    FROM (VALUES
      ('orders', 'id'),
      ('orders', 'user_id'),
      ('orders', 'status'),
      ('orders', 'total'),
      ('orders', 'updated_at'),
      ('orders', 'promo_code_id'),
      ('orders', 'affiliate_id'),
      ('order_items', 'id'),
      ('order_items', 'order_id'),
      ('order_items', 'package_id'),
      ('order_items', 'amount'),
      ('order_items', 'created_at'),
      ('payments', 'id'),
      ('payments', 'order_id'),
      ('payments', 'provider'),
      ('payments', 'provider_reference'),
      ('payments', 'payment_mode'),
      ('payments', 'amount'),
      ('payments', 'status'),
      ('payments', 'paid_at'),
      ('packages', 'id'),
      ('packages', 'name'),
      ('packages', 'commission_type'),
      ('packages', 'commission_value'),
      ('promo_codes', 'id'),
      ('promo_codes', 'affiliate_id'),
      ('affiliate_profiles', 'id'),
      ('affiliate_profiles', 'user_id'),
      ('affiliate_profiles', 'status'),
      ('affiliate_commissions', 'id'),
      ('affiliate_commissions', 'affiliate_id'),
      ('affiliate_commissions', 'order_id'),
      ('affiliate_commissions', 'payment_id'),
      ('affiliate_commissions', 'order_item_id'),
      ('affiliate_commissions', 'amount'),
      ('affiliate_commissions', 'status'),
      ('affiliate_commissions', 'recovery_due'),
      ('affiliate_wallet', 'id'),
      ('affiliate_wallet', 'affiliate_id'),
      ('affiliate_wallet', 'pending_balance'),
      ('affiliate_wallet', 'recovery_balance'),
      ('wallet_transactions', 'wallet_id'),
      ('wallet_transactions', 'amount'),
      ('wallet_transactions', 'transaction_type'),
      ('wallet_transactions', 'reference_id'),
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
      'Required checkout or affiliate columns are missing; apply and verify migrations 20261104101500, 20261104173000, and 20261104190000 first';
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

REVOKE ALL ON FUNCTION private.guard_verified_payment()
  FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION private.guard_paid_order_access()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_affiliate_commission_for_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _promo_affiliate_id uuid;
  _affiliate_user_id uuid;
  _wallet public.affiliate_wallet%ROWTYPE;
  _item public.order_items%ROWTYPE;
  _debt public.affiliate_commissions%ROWTYPE;
  _item_total numeric(12,2);
  _item_count bigint;
  _item_index bigint := 0;
  _allocated numeric(12,2) := 0;
  _item_payment numeric(12,2);
  _commission numeric(12,2);
  _recovery_applied numeric(12,2);
  _recovery_left numeric(12,2);
  _debt_payment numeric(12,2);
  _inserted_id uuid;
  _payable numeric(12,2);
BEGIN
  IF NEW.status <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Commission calculation requires verified server-side payment';
  END IF;
  IF NEW.payment_mode IS DISTINCT FROM 'live'
     OR lower(coalesce(NEW.provider, '')) = 'demo'
     OR NEW.provider_reference IS NULL
     OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Demo or unverified payments cannot earn commissions';
  END IF;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = NEW.order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order was not found';
  END IF;
  IF NEW.amount <> _order.total THEN
    RAISE EXCEPTION 'Verified payment amount does not match the final order total';
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
    RAISE EXCEPTION 'Order items do not reconcile to the final order total';
  END IF;

  UPDATE public.orders
  SET status = 'paid', updated_at = now()
  WHERE id = _order.id AND status <> 'paid';

  IF _order.promo_code_id IS NULL OR _order.affiliate_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pc.affiliate_id, ap.user_id
  INTO _promo_affiliate_id, _affiliate_user_id
  FROM public.promo_codes pc
  JOIN public.affiliate_profiles ap ON ap.id = pc.affiliate_id
  WHERE pc.id = _order.promo_code_id
    AND ap.id = _order.affiliate_id
    AND ap.status = 'approved';

  IF NOT FOUND OR _promo_affiliate_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF _affiliate_user_id = _order.user_id THEN
    RAISE EXCEPTION 'Self-referrals cannot earn affiliate commissions';
  END IF;

  -- Existing commissions created before item-level attribution cannot safely
  -- be mapped to package lines; do not duplicate them on a payment retry.
  IF EXISTS (
    SELECT 1 FROM public.affiliate_commissions
    WHERE order_id = _order.id AND order_item_id IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.affiliate_wallet (affiliate_id)
  VALUES (_promo_affiliate_id)
  ON CONFLICT (affiliate_id) DO NOTHING;

  FOR _item IN
    SELECT *
    FROM public.order_items
    WHERE order_id = NEW.order_id
    ORDER BY created_at, id
  LOOP
    _inserted_id := NULL;
    _item_index := _item_index + 1;
    IF _item_index = _item_count THEN
      _item_payment := NEW.amount - _allocated;
    ELSE
      _item_payment := round(NEW.amount * _item.amount / _item_total, 2);
      _allocated := _allocated + _item_payment;
    END IF;

    IF _item.package_id IS NULL OR _item_payment <= 0 THEN
      CONTINUE;
    END IF;

    _commission := 0;
    INSERT INTO public.affiliate_commissions (
      affiliate_id, order_id, payment_id, order_item_id,
      package_name, purchase_date, commission_type, commission_value,
      payment_amount, gross_amount, amount, status
    )
    SELECT
      _promo_affiliate_id, _order.id, NEW.id, _item.id,
      p.name, coalesce(NEW.paid_at, now()), p.commission_type, p.commission_value,
      _item_payment,
      CASE p.commission_type
        WHEN 'percentage' THEN round(_item_payment * p.commission_value / 100, 2)
        ELSE least(p.commission_value, _item_payment)
      END,
      CASE p.commission_type
        WHEN 'percentage' THEN round(_item_payment * p.commission_value / 100, 2)
        ELSE least(p.commission_value, _item_payment)
      END,
      'pending'
    FROM public.packages p
    WHERE p.id = _item.package_id
      AND p.commission_type IN ('percentage', 'fixed')
      AND p.commission_value > 0
      AND (p.commission_type <> 'percentage' OR p.commission_value <= 100)
    ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING
    RETURNING id, amount INTO _inserted_id, _commission;

    IF _inserted_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO _wallet
    FROM public.affiliate_wallet
    WHERE affiliate_id = _promo_affiliate_id
    FOR UPDATE;

    _recovery_applied := least(_wallet.recovery_balance, _commission);
    _recovery_left := _recovery_applied;
    FOR _debt IN
      SELECT *
      FROM public.affiliate_commissions
      WHERE affiliate_id = _promo_affiliate_id
        AND recovery_due > 0
        AND id <> _inserted_id
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN _recovery_left <= 0;
      _debt_payment := least(_recovery_left, _debt.recovery_due);
      UPDATE public.affiliate_commissions
      SET recovery_due = recovery_due - _debt_payment
      WHERE id = _debt.id;
      _recovery_left := _recovery_left - _debt_payment;
    END LOOP;

    _payable := _commission - _recovery_applied;
    UPDATE public.affiliate_commissions
    SET recovered_amount = _recovery_applied,
        status = CASE WHEN _payable = 0 THEN 'recovered' ELSE 'pending' END
    WHERE id = _inserted_id;
    UPDATE public.affiliate_wallet
    SET pending_balance = pending_balance + _payable,
        recovery_balance = recovery_balance - _recovery_applied,
        updated_at = now()
    WHERE id = _wallet.id;

    IF _payable > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, amount, transaction_type, reference_id
      ) VALUES (_wallet.id, _payable, 'commission_pending', _inserted_id);
    END IF;
    IF _recovery_applied > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, amount, transaction_type, reference_id, ledger_account
      ) VALUES (
        _wallet.id, -_recovery_applied, 'commission_recovery_collected',
        _inserted_id, 'recovery'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_affiliate_commission_for_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_guard_verified_payment ON public.payments;
CREATE TRIGGER payments_guard_verified_payment
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_verified_payment();

DROP TRIGGER IF EXISTS orders_guard_paid_access ON public.orders;
CREATE TRIGGER orders_guard_paid_access
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_order_access();

DROP TRIGGER IF EXISTS payments_record_affiliate_commission ON public.payments;
CREATE TRIGGER payments_record_affiliate_commission
  AFTER INSERT OR UPDATE OF status, payment_mode, amount, order_id ON public.payments
  FOR EACH ROW
  WHEN (NEW.payment_mode IS DISTINCT FROM 'test')
  EXECUTE FUNCTION private.record_affiliate_commission_for_payment();
