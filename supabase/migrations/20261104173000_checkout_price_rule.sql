CREATE OR REPLACE FUNCTION public.create_demo_package_order(
  _user_id uuid,
  _package_slug text,
  _promo_code text,
  _outcome text,
  _request_id uuid
)
RETURNS TABLE (
  order_id uuid,
  payment_id uuid,
  provider_reference text,
  payment_status text,
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
  _reference text := 'DEMO-' || _request_id::text;
  _existing record;
  _new_order_id uuid;
  _new_payment_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Demo checkout requires the server service role';
  END IF;
  IF _user_id IS NULL OR _request_id IS NULL THEN
    RAISE EXCEPTION 'A user and request ID are required';
  END IF;
  IF _outcome NOT IN ('demo_success', 'demo_failed') THEN
    RAISE EXCEPTION 'Invalid demo payment outcome';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));

  SELECT o.id AS order_id, p.id AS payment_id, p.provider_reference,
         p.status AS payment_status, o.total, o.user_id, pkg.slug AS package_slug
    INTO _existing
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  JOIN public.order_items oi ON oi.order_id = o.id
  JOIN public.packages pkg ON pkg.id = oi.package_id
  WHERE p.provider = 'demo' AND p.provider_reference = _reference
  LIMIT 1;

  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.package_slug <> _package_slug THEN
      RAISE EXCEPTION 'This demo request ID is already in use';
    END IF;
    RETURN QUERY SELECT _existing.order_id, _existing.payment_id,
      _existing.provider_reference, _existing.payment_status, _existing.total;
    RETURN;
  END IF;

  SELECT * INTO _package
  FROM public.packages
  WHERE slug = _package_slug AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This package is not available for checkout';
  END IF;
  IF _package.original_price < 0 OR _package.selling_price < 0
    OR _package.selling_price > _package.original_price THEN
    RAISE EXCEPTION 'This package has invalid pricing';
  END IF;

  _payable := _package.original_price;
  IF NULLIF(upper(trim(_promo_code)), '') IS NOT NULL THEN
    SELECT * INTO _promo
    FROM public.promo_codes
    WHERE code = upper(trim(_promo_code));
    IF NOT FOUND OR NOT _promo.active THEN
      RAISE EXCEPTION 'This promo code is invalid or inactive';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(_promo.id::text, 1));
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

    _payable := _package.selling_price;
  END IF;

  INSERT INTO public.orders (
    user_id, status, total, currency, promo_code_id, affiliate_id
  )
  VALUES (
    _user_id,
    CASE WHEN _outcome = 'demo_failed' THEN 'cancelled'::public.order_status
         ELSE 'pending'::public.order_status END,
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
    'demo',
    'demo',
    _reference,
    _payable,
    _outcome,
    NULL
  )
  RETURNING id INTO _new_payment_id;

  RETURN QUERY SELECT _new_order_id, _new_payment_id, _reference, _outcome, _payable;
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_package_order(uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_package_order(uuid, text, text, text, uuid)
  TO service_role;
