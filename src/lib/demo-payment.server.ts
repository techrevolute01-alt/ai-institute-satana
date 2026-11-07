import { createClient } from "@supabase/supabase-js";

type DemoPaymentStatus = "demo_success" | "demo_failed";
type DemoPaymentRecord = {
  id: string;
  order_id: string;
  provider_reference: string | null;
  status: string;
  amount: number;
};
type DemoRpcResult = {
  order_id: string;
  payment_id: string;
  provider_reference: string;
  payment_status: DemoPaymentStatus;
  total: number;
};

export function isDemoPaymentEnabled() {
  const runtime = process.env["NODE_ENV"];
  const configuredRef = process.env["DEMO_SUPABASE_PROJECT_ID"];
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (
    process.env["DEMO_PAYMENTS_ENABLED"] !== "true" ||
    (runtime !== "development" && runtime !== "test") ||
    !configuredRef ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return false;
  }

  const projectId =
    /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(supabaseUrl)?.[1] ??
    (/^https?:\/\/(localhost|127\.0\.0\.1):54321\/?$/i.test(supabaseUrl) ? "local" : undefined);
  return projectId === configuredRef;
}

export async function createDemoPackagePayment(input: {
  userId: string;
  packageSlug: string;
  promoCode: string | null;
  outcome: DemoPaymentStatus;
  requestId: string;
}): Promise<DemoRpcResult> {
  if (!isDemoPaymentEnabled()) {
    throw new Error("Demo payments are not enabled for this non-production test project.");
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("Demo payment service configuration is unavailable.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = supabase as unknown as {
    rpc(
      name: "create_demo_package_order",
      args: {
        _user_id: string;
        _package_slug: string;
        _promo_code: string | null;
        _outcome: DemoPaymentStatus;
        _request_id: string;
      },
    ): Promise<{ data: DemoRpcResult[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await admin.rpc("create_demo_package_order", {
    _user_id: input.userId,
    _package_slug: input.packageSlug,
    _promo_code: input.promoCode,
    _outcome: input.outcome,
    _request_id: input.requestId,
  });
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Demo payment did not return a transaction receipt.");
  return result;
}

export async function getMyDemoPayment(userId: string, paymentId: string) {
  if (!isDemoPaymentEnabled()) {
    throw new Error("Demo payment receipts are only available in the configured test project.");
  }
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Demo payment service configuration is unavailable.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, order_id, provider_reference, status, amount, payment_mode")
    .eq("id", paymentId)
    .eq("payment_mode", "demo")
    .maybeSingle();
  if (paymentError) throw new Error(paymentError.message);
  const demo = payment as DemoPaymentRecord | null;
  if (!demo) return null;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, total")
    .eq("id", demo.order_id)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order || order.user_id !== userId) return null;

  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("title, package_id")
    .eq("order_id", demo.order_id)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item?.package_id) return null;

  return {
    paymentId: demo.id,
    orderId: order.id,
    reference: demo.provider_reference,
    status: demo.status,
    packageName: item.title,
    amount: Number(demo.amount),
    orderTotal: Number(order.total),
  };
}
