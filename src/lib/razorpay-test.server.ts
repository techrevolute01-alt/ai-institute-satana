import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  razorpayConfigurationMessage,
  type RazorpayTestModeStatus,
} from "@/lib/razorpay-test-config";

type DbError = { message: string; code?: string };
type PaymentRecord = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_reference: string | null;
  payment_mode: string | null;
  amount: number | string;
  status: string;
};
type OrderRecord = {
  id: string;
  user_id: string;
  total: number | string;
  currency: string;
  status: string;
};
type OrderItemRecord = { title: string; package_id: string | null };
type Query<T> = {
  eq(column: string, value: string): Query<T>;
  select(columns: string): Query<T>;
  maybeSingle(): Promise<{ data: T | null; error: DbError | null }>;
  update(values: Record<string, unknown>): Query<T>;
};
type AdminClient = {
  from(table: "payments"): Query<PaymentRecord>;
  from(table: "orders"): Query<OrderRecord>;
  from(table: "order_items"): Query<OrderItemRecord>;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: DbError | null }>;
};
type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};
type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
};
type RazorpayOrderPayments = { items: Array<Pick<RazorpayPayment, "status">> };

const razorpayApi = "https://api.razorpay.com/v1";

export function formatRazorpayRpcError(name: string, error: DbError) {
  const code = error.code ? ` (database error ${error.code})` : "";
  return `Razorpay TEST checkout could not call ${name}${code}: ${error.message}`;
}

function getRazorpayConfig() {
  const keyId = process.env["VITE_RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  const status = getRazorpayTestModeStatus();
  if (status !== "ready" || !keyId || !keySecret) {
    throw new Error(razorpayConfigurationMessage(status));
  }
  return { keyId, keySecret };
}

export function getRazorpayTestModeStatus(): RazorpayTestModeStatus {
  const keyId = process.env["VITE_RAZORPAY_KEY_ID"];
  if (!keyId) return "missing_key_id";
  if (!keyId.startsWith("rzp_test_")) return "invalid_key_id";
  if (!process.env["RAZORPAY_KEY_SECRET"]) return "missing_secret";
  return "ready";
}

export function isRazorpayTestModeConfigured() {
  return getRazorpayTestModeStatus() === "ready";
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function getAdminClient() {
  return supabaseAdmin as unknown as AdminClient;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getAdminClient().rpc(name, args);
  if (error) {
    throw new Error(formatRazorpayRpcError(name, error));
  }
  if (!data) throw new Error(`The payment service did not return ${name} data.`);
  return data as T;
}

async function razorpayRequest<T>(
  path: string,
  keyId: string,
  keySecret: string,
  init?: RequestInit,
): Promise<T> {
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
  const response = await fetch(`${razorpayApi}${path}`, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Razorpay request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function getPaymentRecords(paymentId: string, userId: string) {
  const admin = getAdminClient();
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id, order_id, provider, provider_reference, payment_mode, amount, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) throw new Error(paymentError.message);
  if (!payment || payment.provider !== "razorpay" || payment.payment_mode !== "test") {
    throw new Error("The Razorpay TEST payment was not found.");
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, total, currency, status")
    .eq("id", payment.order_id)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order || order.user_id !== userId) {
    throw new Error("The payment does not belong to your account.");
  }
  return { payment, order };
}

export async function createRazorpayTestOrder(input: {
  userId: string;
  packageSlug: string;
  promoCode: string | null;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const created = await callRpc<
    Array<{ order_id: string; payment_id: string; total: number | string }>
  >("create_razorpay_test_order", {
    _user_id: input.userId,
    _package_slug: input.packageSlug,
    _promo_code: input.promoCode,
  });
  const record = created[0];
  if (!record) throw new Error("The order service did not return a pending order.");

  const amount = Math.round(Number(record.total) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) {
    await cancelRazorpayTestOrder(input.userId, record.payment_id);
    throw new Error("Razorpay requires a package total of at least ₹1.00.");
  }

  try {
    const razorpayOrder = await razorpayRequest<RazorpayOrder>("/orders", keyId, keySecret, {
      method: "POST",
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: record.order_id,
        notes: { order_id: record.order_id, payment_id: record.payment_id },
      }),
    });
    if (!razorpayOrder.id || razorpayOrder.amount !== amount || razorpayOrder.currency !== "INR") {
      throw new Error("Razorpay returned an order that does not match the package total.");
    }

    const admin = getAdminClient();
    const { data: updated, error } = await admin
      .from("payments")
      .update({ provider_reference: razorpayOrder.id })
      .eq("id", record.payment_id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("The pending payment could not be linked to Razorpay.");

    return {
      orderId: razorpayOrder.id,
      paymentId: record.payment_id,
      amount,
      currency: razorpayOrder.currency,
      keyId,
    };
  } catch (error) {
    try {
      await cancelRazorpayTestOrder(input.userId, record.payment_id);
    } catch (cleanupError) {
      throw new Error(
        `Razorpay order creation failed, and the pending order could not be cancelled: ${
          cleanupError instanceof Error ? cleanupError.message : "unknown cleanup error"
        }`,
      );
    }
    throw error;
  }
}

async function cancelRazorpayTestOrder(userId: string, paymentId: string) {
  await callRpc<string>("cancel_razorpay_test_order", {
    _payment_id: paymentId,
    _user_id: userId,
    _payment_status: "cancelled",
  });
}

export async function cancelRazorpayTestPayment(userId: string, paymentId: string) {
  const { keyId, keySecret } = getRazorpayConfig();
  const { payment } = await getPaymentRecords(paymentId, userId);
  if (payment.status !== "pending") return;
  if (payment.provider_reference) {
    const remotePayments = await razorpayRequest<RazorpayOrderPayments>(
      `/orders/${encodeURIComponent(payment.provider_reference)}/payments`,
      keyId,
      keySecret,
    );
    if (
      remotePayments.items.some(
        (remotePayment) =>
          remotePayment.status === "authorized" || remotePayment.status === "captured",
      )
    ) {
      throw new Error(
        "Razorpay has an authorized or captured payment for this order; it cannot be cancelled.",
      );
    }
  }
  await cancelRazorpayTestOrder(userId, paymentId);
}

export async function recordRazorpayTestFailure(input: {
  userId: string;
  paymentId: string;
  razorpayPaymentId: string;
  orderId: string;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const { payment, order } = await getPaymentRecords(input.paymentId, input.userId);
  if (payment.status !== "pending" || payment.provider_reference !== input.orderId) {
    throw new Error("The payment is no longer pending or does not match this order.");
  }
  const razorpayPayment = await razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(input.razorpayPaymentId)}`,
    keyId,
    keySecret,
  );
  if (
    razorpayPayment.id !== input.razorpayPaymentId ||
    razorpayPayment.order_id !== input.orderId ||
    razorpayPayment.status !== "failed" ||
    razorpayPayment.amount !== Math.round(Number(order.total) * 100) ||
    razorpayPayment.currency !== order.currency
  ) {
    throw new Error("Razorpay has not confirmed that this payment failed.");
  }
  await callRpc<string>("cancel_razorpay_test_order", {
    _payment_id: input.paymentId,
    _user_id: input.userId,
    _payment_status: "failed",
  });
}

export async function verifyRazorpayTestPayment(input: {
  userId: string;
  paymentId: string;
  razorpayPaymentId: string;
  orderId: string;
  signature: string;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const { payment, order } = await getPaymentRecords(input.paymentId, input.userId);
  const isPendingAttempt =
    payment.status === "pending" && payment.provider_reference === input.orderId;
  const alreadyVerified =
    payment.status === "paid" && payment.provider_reference === input.razorpayPaymentId;
  if (
    (!isPendingAttempt && !alreadyVerified) ||
    order.currency !== "INR" ||
    Number(payment.amount) !== Number(order.total)
  ) {
    throw new Error("The payment does not match a pending package order.");
  }
  if (
    !verifyRazorpaySignature(input.orderId, input.razorpayPaymentId, input.signature, keySecret)
  ) {
    throw new Error("Razorpay payment signature verification failed.");
  }

  const razorpayPayment = await razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(input.razorpayPaymentId)}`,
    keyId,
    keySecret,
  );
  if (
    razorpayPayment.id !== input.razorpayPaymentId ||
    razorpayPayment.order_id !== input.orderId ||
    razorpayPayment.amount !== Math.round(Number(order.total) * 100) ||
    razorpayPayment.currency !== order.currency ||
    razorpayPayment.status !== "captured" ||
    razorpayPayment.captured !== true
  ) {
    if (
      razorpayPayment.status === "authorized" &&
      razorpayPayment.captured === false &&
      razorpayPayment.order_id === input.orderId &&
      razorpayPayment.amount === Math.round(Number(order.total) * 100) &&
      razorpayPayment.currency === order.currency
    ) {
      const capturedPayment = await razorpayRequest<RazorpayPayment>(
        `/payments/${encodeURIComponent(input.razorpayPaymentId)}/capture`,
        keyId,
        keySecret,
        {
          method: "POST",
          body: JSON.stringify({
            amount: razorpayPayment.amount,
            currency: razorpayPayment.currency,
          }),
        },
      );
      if (
        capturedPayment.id === input.razorpayPaymentId &&
        capturedPayment.order_id === input.orderId &&
        capturedPayment.amount === Math.round(Number(order.total) * 100) &&
        capturedPayment.currency === order.currency &&
        capturedPayment.status === "captured" &&
        capturedPayment.captured === true
      ) {
        return callRpc<{ order_id: string; payment_id: string; status: string }>(
          "complete_razorpay_test_payment",
          {
            _payment_id: input.paymentId,
            _user_id: input.userId,
            _razorpay_order_id: input.orderId,
            _razorpay_payment_id: input.razorpayPaymentId,
          },
        );
      }
    }
    throw new Error("Razorpay has not confirmed a captured payment for this package order.");
  }

  return callRpc<{ order_id: string; payment_id: string; status: string }>(
    "complete_razorpay_test_payment",
    {
      _payment_id: input.paymentId,
      _user_id: input.userId,
      _razorpay_order_id: input.orderId,
      _razorpay_payment_id: input.razorpayPaymentId,
    },
  );
}

export async function getRazorpayTestReceipt(userId: string, paymentId: string) {
  const { payment, order } = await getPaymentRecords(paymentId, userId);
  const { data: item, error } = await getAdminClient()
    .from("order_items")
    .select("title, package_id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!item?.package_id) return null;
  return {
    paymentId: payment.id,
    orderId: order.id,
    reference: payment.provider_reference,
    status: payment.status,
    packageName: item.title,
    amount: Number(payment.amount),
    orderStatus: order.status,
  };
}
