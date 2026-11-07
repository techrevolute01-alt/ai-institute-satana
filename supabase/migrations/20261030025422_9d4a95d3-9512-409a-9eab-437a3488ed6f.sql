DROP POLICY IF EXISTS orders_create ON public.orders;
REVOKE INSERT, UPDATE ON public.orders FROM authenticated, anon;
REVOKE INSERT ON public.order_items FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order_created_at
  ON public.payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_order_created_at
  ON public.refunds (order_id, created_at DESC);