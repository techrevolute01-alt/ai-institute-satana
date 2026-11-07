-- Affiliate commission settings and verified-payment accounting.
-- This migration is additive: it preserves existing packages, orders, promo codes,
-- commissions, wallets, payouts, payments, and refund rows.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_value numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.packages'::regclass
      AND conname = 'packages_commission_type_check'
  ) THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_commission_type_check
      CHECK (commission_type IN ('percentage', 'fixed')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.packages'::regclass
      AND conname = 'packages_commission_value_check'
  ) THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_commission_value_check
      CHECK (
        commission_value >= 0
        AND (commission_type <> 'percentage' OR commission_value <= 100)
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS purchase_date timestamptz,
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovered_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_due numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.affiliate_commissions
SET gross_amount = amount
WHERE gross_amount = 0 AND amount > 0;

UPDATE public.affiliate_commissions
SET purchase_date = created_at
WHERE purchase_date IS NULL;

UPDATE public.affiliate_commissions
SET paid_amount = amount
WHERE status = 'paid' AND paid_amount = 0 AND amount > 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.affiliate_commissions'::regclass
      AND conname = 'affiliate_commissions_type_check'
  ) THEN
    ALTER TABLE public.affiliate_commissions
      ADD CONSTRAINT affiliate_commissions_type_check
      CHECK (commission_type IN ('percentage', 'fixed')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.affiliate_commissions'::regclass
      AND conname = 'affiliate_commissions_amounts_check'
  ) THEN
    ALTER TABLE public.affiliate_commissions
      ADD CONSTRAINT affiliate_commissions_amounts_check
      CHECK (
        amount >= 0 AND payment_amount >= 0 AND gross_amount >= 0
        AND refunded_amount >= 0 AND paid_amount >= 0
        AND recovered_amount >= 0 AND recovery_due >= 0
        AND commission_value >= 0
        AND (commission_type <> 'percentage' OR commission_value <= 100)
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.affiliate_wallet
  ADD COLUMN IF NOT EXISTS recovery_balance numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider_reference text;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS ledger_account text NOT NULL DEFAULT 'wallet';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wallet_transactions'::regclass
      AND conname = 'wallet_transactions_ledger_account_check'
  ) THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_ledger_account_check
      CHECK (ledger_account IN ('wallet', 'recovery')) NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.affiliate_wallet'::regclass
      AND conname = 'affiliate_wallet_recovery_balance_check'
  ) THEN
    ALTER TABLE public.affiliate_wallet
      ADD CONSTRAINT affiliate_wallet_recovery_balance_check
      CHECK (recovery_balance >= 0) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_order_item_unique
  ON public.affiliate_commissions (order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_commissions_payment_idx
  ON public.affiliate_commissions (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS affiliate_commissions_recovery_idx
  ON public.affiliate_commissions (affiliate_id, created_at, id)
  WHERE recovery_due > 0;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_payment_provider_reference_unique
  ON public.refunds (payment_id, provider_reference)
  WHERE payment_id IS NOT NULL AND provider_reference IS NOT NULL;

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

    IF NEW.payment_mode IS DISTINCT FROM 'live'
       OR lower(coalesce(NEW.provider, '')) = 'demo' THEN
      RAISE EXCEPTION 'Demo payments cannot be marked paid';
    END IF;
    IF NEW.provider_reference IS NULL OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'A verified live payment is required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_verified_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_guard_verified_payment ON public.payments;
CREATE TRIGGER payments_guard_verified_payment
  BEFORE INSERT OR UPDATE
  ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.guard_verified_payment();

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
      RAISE EXCEPTION 'Only the verified payment service may grant course access';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.order_id = NEW.id
        AND p.status = 'paid'
        AND p.payment_mode = 'live'
        AND lower(coalesce(p.provider, '')) <> 'demo'
        AND p.provider_reference IS NOT NULL
        AND p.amount = NEW.total
    ) THEN
      RAISE EXCEPTION 'A verified live payment is required before course access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_paid_order_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_guard_paid_access ON public.orders;
CREATE TRIGGER orders_guard_paid_access
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_order_access();

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
      AND EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.order_id = o.id
          AND p.status = 'paid'
          AND p.payment_mode = 'live'
          AND lower(coalesce(p.provider, '')) <> 'demo'
          AND p.provider_reference IS NOT NULL
          AND p.amount = o.total
      )
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

REVOKE ALL ON FUNCTION private.has_paid_package_course_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_paid_package_course_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.has_course_access(_user uuid, _course uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND (
    private.has_role(_user, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.user_id = _user AND e.course_id = _course
    )
    OR private.has_paid_package_course_access(_user, _course)
    OR EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.user_id = _user
        AND o.status = 'paid'
        AND oi.course_id = _course
        AND EXISTS (
          SELECT 1
          FROM public.payments p
          WHERE p.order_id = o.id
            AND p.status = 'paid'
            AND p.payment_mode = 'live'
            AND lower(coalesce(p.provider, '')) <> 'demo'
            AND p.provider_reference IS NOT NULL
            AND p.amount = o.total
        )
    )
  )
$$;

REVOKE ALL ON FUNCTION private.has_course_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_course_access(uuid, uuid) TO authenticated;

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

DROP TRIGGER IF EXISTS payments_record_affiliate_commission ON public.payments;
CREATE TRIGGER payments_record_affiliate_commission
  AFTER INSERT OR UPDATE OF status, payment_mode, amount, order_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.record_affiliate_commission_for_payment();

CREATE OR REPLACE FUNCTION private.adjust_affiliate_commission_for_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _payment public.payments%ROWTYPE;
  _commission public.affiliate_commissions%ROWTYPE;
  _wallet public.affiliate_wallet%ROWTYPE;
  _refund_total numeric(12,2);
  _retained_payment numeric(12,2);
  _new_amount numeric(12,2);
  _old_unpaid numeric(12,2);
  _new_unpaid numeric(12,2);
  _revoke_unpaid numeric(12,2);
  _settled_due numeric(12,2);
  _available_debit numeric(12,2);
  _pending_debit numeric(12,2);
  _recovery_increment numeric(12,2);
  _new_recovery_due numeric(12,2);
  _new_status text;
BEGIN
  IF NEW.status NOT IN ('refunded', 'chargeback') THEN
    RETURN NEW;
  END IF;
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the payment service may record a completed refund';
  END IF;
  IF NEW.payment_id IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A completed refund requires a payment and a positive amount';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('refunded', 'chargeback')
     AND (NEW.payment_id IS DISTINCT FROM OLD.payment_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) THEN
    RAISE EXCEPTION 'A completed refund is immutable';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('refunded', 'chargeback') THEN
    RETURN NEW;
  END IF;
  IF NEW.provider_reference IS NULL OR btrim(NEW.provider_reference) = '' THEN
    RAISE EXCEPTION 'A completed refund requires its provider idempotency reference';
  END IF;

  SELECT * INTO _payment
  FROM public.payments
  WHERE id = NEW.payment_id AND order_id = NEW.order_id
  FOR UPDATE;
  IF NOT FOUND OR _payment.status <> 'paid'
     OR _payment.payment_mode <> 'live'
     OR lower(coalesce(_payment.provider, '')) = 'demo'
     OR _payment.provider_reference IS NULL THEN
    RAISE EXCEPTION 'Refund does not reference a verified live payment';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO _refund_total
  FROM public.refunds
  WHERE payment_id = NEW.payment_id
    AND status IN ('refunded', 'chargeback');
  IF _refund_total > _payment.amount THEN
    RAISE EXCEPTION 'Total completed refunds cannot exceed the captured payment';
  END IF;
  _retained_payment := _payment.amount - _refund_total;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id = NEW.order_id
      AND status = 'paid'
      AND payment_mode = 'live'
      AND lower(coalesce(provider, '')) <> 'demo'
      AND amount > (
        SELECT coalesce(sum(r.amount), 0)
        FROM public.refunds r
        WHERE r.payment_id = payments.id
          AND r.status IN ('refunded', 'chargeback')
      )
  ) THEN
    UPDATE public.orders
    SET status = 'refunded', updated_at = now()
    WHERE id = NEW.order_id;
  END IF;

  FOR _commission IN
    SELECT *
    FROM public.affiliate_commissions
    WHERE payment_id = NEW.payment_id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    _new_amount := round(_commission.gross_amount * _retained_payment / _payment.amount, 2);
    _old_unpaid := greatest(
      _commission.amount - _commission.paid_amount
      - _commission.recovered_amount - _commission.recovery_due,
      0
    );
    _new_unpaid := greatest(
      _new_amount - _commission.paid_amount
      - _commission.recovered_amount - _commission.recovery_due,
      0
    );
    _revoke_unpaid := greatest(_old_unpaid - _new_unpaid, 0);
    _settled_due := greatest(
      _commission.paid_amount + _commission.recovered_amount - _new_amount
      - _commission.recovery_due,
      0
    );

    SELECT * INTO _wallet
    FROM public.affiliate_wallet
    WHERE affiliate_id = _commission.affiliate_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Affiliate wallet is missing for commission %', _commission.id;
    END IF;

    _pending_debit := 0;
    _available_debit := 0;
    _recovery_increment := 0;

    IF _commission.status = 'pending' THEN
      _pending_debit := _revoke_unpaid;
      IF _wallet.pending_balance < _pending_debit THEN
        RAISE EXCEPTION 'Pending commission balance is inconsistent; refund was not applied';
      END IF;
      _recovery_increment := _settled_due;
    ELSE
      _available_debit := least(
        _wallet.available_balance,
        _revoke_unpaid + _settled_due
      );
      _recovery_increment := _revoke_unpaid + _settled_due - _available_debit;
    END IF;

    _new_recovery_due := _commission.recovery_due + _recovery_increment;
    _new_status := CASE
      WHEN _new_amount = 0 THEN 'reversed'
      WHEN _new_amount <= _commission.paid_amount + _commission.recovered_amount + _new_recovery_due
        THEN CASE
          WHEN _commission.paid_amount >= _new_amount THEN 'paid'
          ELSE 'recovered'
        END
      WHEN _commission.status = 'pending' THEN 'pending'
      ELSE 'approved'
    END;

    UPDATE public.affiliate_wallet
    SET pending_balance = pending_balance - _pending_debit,
        available_balance = available_balance - _available_debit,
        recovery_balance = recovery_balance + _recovery_increment,
        updated_at = now()
    WHERE id = _wallet.id;

    UPDATE public.affiliate_commissions
    SET amount = _new_amount,
        refunded_amount = _payment.amount - _retained_payment,
        recovery_due = _new_recovery_due,
        status = _new_status
    WHERE id = _commission.id;

    IF _pending_debit > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, amount, transaction_type, reference_id
      ) VALUES (_wallet.id, -_pending_debit, 'refund_pending_reversal', NEW.id);
    END IF;
    IF _available_debit > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, amount, transaction_type, reference_id
      ) VALUES (_wallet.id, -_available_debit, 'refund_available_reversal', NEW.id);
    END IF;
    IF _recovery_increment > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, amount, transaction_type, reference_id, ledger_account
      ) VALUES (
        _wallet.id, _recovery_increment, 'commission_recovery_due',
        NEW.id, 'recovery'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.adjust_affiliate_commission_for_refund()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refunds_adjust_affiliate_commission ON public.refunds;
CREATE TRIGGER refunds_adjust_affiliate_commission
  AFTER INSERT OR UPDATE OF status, amount, payment_id, order_id, provider_reference ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION private.adjust_affiliate_commission_for_refund();

CREATE OR REPLACE FUNCTION public.approve_affiliate_commission(_commission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _commission public.affiliate_commissions%ROWTYPE;
  _wallet public.affiliate_wallet%ROWTYPE;
  _payable numeric(12,2);
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the admin service may approve commissions';
  END IF;

  SELECT * INTO _commission
  FROM public.affiliate_commissions
  WHERE id = _commission_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commission not found';
  END IF;
  IF _commission.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending commissions can be approved';
  END IF;

  _payable := greatest(
    _commission.amount - _commission.paid_amount
    - _commission.recovered_amount - _commission.recovery_due,
    0
  );
  SELECT * INTO _wallet
  FROM public.affiliate_wallet
  WHERE affiliate_id = _commission.affiliate_id
  FOR UPDATE;
  IF NOT FOUND OR _wallet.pending_balance < _payable THEN
    RAISE EXCEPTION 'Pending commission balance is inconsistent';
  END IF;

  UPDATE public.affiliate_wallet
  SET pending_balance = pending_balance - _payable,
      available_balance = available_balance + _payable,
      updated_at = now()
  WHERE id = _wallet.id;
  UPDATE public.affiliate_commissions
  SET status = CASE WHEN _payable = 0 THEN 'recovered' ELSE 'approved' END
  WHERE id = _commission.id;

  IF _payable > 0 THEN
    INSERT INTO public.wallet_transactions (
      wallet_id, amount, transaction_type, reference_id
    ) VALUES
      (_wallet.id, -_payable, 'commission_pending_release', _commission.id),
      (_wallet.id, _payable, 'commission_approved_credit', _commission.id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_affiliate_commission(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_commission(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.process_affiliate_payout(
  _payout_id uuid,
  _approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _payout public.affiliate_payouts%ROWTYPE;
  _wallet public.affiliate_wallet%ROWTYPE;
  _commission public.affiliate_commissions%ROWTYPE;
  _remaining numeric(12,2);
  _payable numeric(12,2);
  _paid numeric(12,2);
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the admin service may process affiliate payouts';
  END IF;

  SELECT * INTO _payout
  FROM public.affiliate_payouts
  WHERE id = _payout_id
  FOR UPDATE;
  IF NOT FOUND OR _payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Pending payout request not found';
  END IF;

  IF NOT _approve THEN
    UPDATE public.affiliate_payouts
    SET status = 'rejected', processed_at = now()
    WHERE id = _payout.id;
    RETURN;
  END IF;

  SELECT * INTO _wallet
  FROM public.affiliate_wallet
  WHERE affiliate_id = _payout.affiliate_id
  FOR UPDATE;
  IF NOT FOUND OR _wallet.available_balance < _payout.amount THEN
    RAISE EXCEPTION 'Affiliate balance is lower than the requested amount';
  END IF;

  UPDATE public.affiliate_wallet
  SET available_balance = available_balance - _payout.amount,
      updated_at = now()
  WHERE id = _wallet.id;
  INSERT INTO public.wallet_transactions (
    wallet_id, amount, transaction_type, reference_id, ledger_account
  ) VALUES (_wallet.id, -_payout.amount, 'withdrawal', _payout.id, 'wallet');

  _remaining := _payout.amount;
  FOR _commission IN
    SELECT *
    FROM public.affiliate_commissions
    WHERE affiliate_id = _payout.affiliate_id
      AND status IN ('approved', 'paid')
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _payable := greatest(
      _commission.amount - _commission.paid_amount
      - _commission.recovered_amount - _commission.recovery_due,
      0
    );
    _paid := least(_remaining, _payable);
    IF _paid > 0 THEN
      UPDATE public.affiliate_commissions
      SET paid_amount = paid_amount + _paid,
          status = CASE
            WHEN paid_amount + _paid + recovered_amount + recovery_due >= amount
              THEN 'paid'
            ELSE 'approved'
          END
      WHERE id = _commission.id;
      _remaining := _remaining - _paid;
    END IF;
  END LOOP;

  -- Any remainder can only be backed by pre-existing wallet funds/records.
  -- Keep the wallet ledger and payout record intact without inventing a commission.
  UPDATE public.affiliate_payouts
  SET status = 'paid', processed_at = now()
  WHERE id = _payout.id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_affiliate_payout(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_affiliate_payout(uuid, boolean) TO service_role;

COMMENT ON COLUMN public.affiliate_wallet.recovery_balance IS
  'Non-negative clawback receivable. Future earned commissions are applied to this debt before becoming payable.';
COMMENT ON COLUMN public.affiliate_commissions.recovery_due IS
  'Unrecovered refund/chargeback debt attributable to this commission; never represented by a negative wallet balance.';
COMMENT ON COLUMN public.affiliate_commissions.recovered_amount IS
  'Commission earnings withheld to settle previously recorded refund/chargeback recovery debt.';
COMMENT ON COLUMN public.wallet_transactions.ledger_account IS
  'Separates payable wallet movements from refund/chargeback recovery receivables.';
COMMENT ON FUNCTION public.process_affiliate_payout(uuid, boolean) IS
  'Atomically processes payout status, wallet debit, ledger entry, and commission paid allocations.';
