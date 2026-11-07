import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type OrderRecord = {
  id: string;
  user_id: string;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type OrderItemRecord = {
  id: string;
  order_id: string;
  package_id: string | null;
  course_id: string | null;
  title: string;
  amount: number | string;
};
type PaymentRecord = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_reference: string | null;
  amount: number | string;
  status: string;
  paid_at: string | null;
  created_at: string;
};
type RefundRecord = {
  id: string;
  order_id: string;
  payment_id: string | null;
  amount: number | string;
  reason: string | null;
  status: string;
  created_at: string;
};
type UserRecord = { id: string; full_name: string; email: string | null };
type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type Query<T> = PromiseLike<DbResult<T[]>> & {
  select(columns: string): Query<T>;
  eq(column: string, value: string): Query<T>;
  in(column: string, values: string[]): Query<T>;
  order(column: string, options?: { ascending?: boolean }): Query<T>;
  limit(count: number): Query<T>;
};
type OrderClient = {
  from(table: "orders"): Query<OrderRecord>;
  from(table: "order_items"): Query<OrderItemRecord>;
  from(table: "payments"): Query<PaymentRecord>;
  from(table: "refunds"): Query<RefundRecord>;
  from(table: "users"): Query<UserRecord>;
};

export type OrderItemDetails = {
  id: string;
  package_id: string | null;
  course_id: string | null;
  title: string;
  amount: number;
};
export type PaymentDetails = {
  id: string;
  provider: string | null;
  provider_reference: string | null;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};
export type RefundDetails = {
  id: string;
  payment_id: string | null;
  amount: number;
  reason: string | null;
  status: string;
  created_at: string;
};
export type ManagedOrder = {
  id: string;
  customer: string;
  email: string | null;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  items: OrderItemDetails[];
  payments: PaymentDetails[];
  refunds: RefundDetails[];
};
export type StudentOrder = Omit<ManagedOrder, "customer" | "email" | "payments"> & {
  payments: Omit<PaymentDetails, "provider_reference">[];
};

function groupByOrderId<T extends { order_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const existing = grouped.get(row.order_id) ?? [];
    existing.push(row);
    grouped.set(row.order_id, existing);
  }
  return grouped;
}

async function orderDetails(
  client: OrderClient,
  orderRecords: OrderRecord[],
  customerInfo: Map<string, UserRecord>,
  includePaymentReferences: boolean,
): Promise<ManagedOrder[]> {
  const orderIds = orderRecords.map((order) => order.id);
  if (!orderIds.length) return [];
  const [itemsResult, paymentsResult, refundsResult] = await Promise.all([
    client
      .from("order_items")
      .select("id, order_id, package_id, course_id, title, amount")
      .in("order_id", orderIds),
    client
      .from("payments")
      .select("id, order_id, provider, provider_reference, amount, status, paid_at, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
    client
      .from("refunds")
      .select("id, order_id, payment_id, amount, reason, status, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [itemsResult, paymentsResult, refundsResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const items = groupByOrderId(itemsResult.data ?? []);
  const payments = groupByOrderId(paymentsResult.data ?? []);
  const refunds = groupByOrderId(refundsResult.data ?? []);
  return orderRecords.map((order) => ({
    id: order.id,
    customer: customerInfo.get(order.user_id)?.full_name || "Name unavailable",
    email: customerInfo.get(order.user_id)?.email ?? null,
    total: Number(order.total),
    currency: order.currency,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: (items.get(order.id) ?? []).map((item) => ({
      id: item.id,
      package_id: item.package_id,
      course_id: item.course_id,
      title: item.title,
      amount: Number(item.amount),
    })),
    payments: (payments.get(order.id) ?? []).map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      provider_reference: includePaymentReferences ? payment.provider_reference : null,
      amount: Number(payment.amount),
      status: payment.status,
      paid_at: payment.paid_at,
      created_at: payment.created_at,
    })),
    refunds: (refunds.get(order.id) ?? []).map((refund) => ({
      id: refund.id,
      payment_id: refund.payment_id,
      amount: Number(refund.amount),
      reason: refund.reason,
      status: refund.status,
      created_at: refund.created_at,
    })),
  }));
}

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentOrder[]> => {
    const client = context.supabase as unknown as OrderClient;
    const { data: orderRecords, error } = await client
      .from("orders")
      .select("id, user_id, total, currency, status, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const orders = orderRecords ?? [];
    const details = await orderDetails(
      client,
      orders,
      new Map(
        orders.map((order) => [order.user_id, { id: order.user_id, full_name: "", email: null }]),
      ),
      false,
    );
    return details.map(({ email: _email, customer: _customer, ...order }) => ({
      ...order,
      payments: order.payments.map(({ provider_reference: _reference, ...payment }) => payment),
    }));
  });

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedOrder[]> => {
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(rolesError.message);
    if (!roles?.some((role) => role.role === "admin")) {
      throw new Error("Forbidden: Admin access required.");
    }
    const client = context.supabase as unknown as OrderClient;
    const { data: orderRecords, error } = await client
      .from("orders")
      .select("id, user_id, total, currency, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const orders = orderRecords ?? [];
    const customerIds = [...new Set(orders.map((order) => order.user_id))];
    let customerInfo = new Map<string, UserRecord>();
    if (customerIds.length) {
      const adminClient = (await import("@/integrations/supabase/client.server"))
        .supabaseAdmin as unknown as OrderClient;
      const { data: customers, error: customersError } = await adminClient
        .from("users")
        .select("id, full_name, email")
        .in("id", customerIds);
      if (customersError) throw new Error(customersError.message);
      customerInfo = new Map((customers ?? []).map((customer) => [customer.id, customer]));
    }
    return orderDetails(client, orders, customerInfo, true);
  });

export const getOrderDetailsForStudent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const client = context.supabase as unknown as OrderClient;
    const { data: orderRecords, error } = await client
      .from("orders")
      .select("id, user_id, total, currency, status, created_at, updated_at")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .limit(1);
    if (error) throw new Error(error.message);
    const order = orderRecords?.[0];
    if (!order) throw new Error("Order not found.");
    const [itemsResult, paymentsResult, refundsResult] = await Promise.all([
      client
        .from("order_items")
        .select("id, order_id, package_id, course_id, title, amount")
        .eq("order_id", order.id),
      client
        .from("payments")
        .select("id, order_id, provider, provider_reference, amount, status, paid_at, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
      client
        .from("refunds")
        .select("id, order_id, payment_id, amount, reason, status, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
    ]);
    for (const result of [itemsResult, paymentsResult, refundsResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      id: order.id,
      total: Number(order.total),
      currency: order.currency,
      status: order.status,
      created_at: order.created_at,
      items: (itemsResult.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        amount: Number(item.amount),
      })),
      payments: (paymentsResult.data ?? []).map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        amount: Number(payment.amount),
        status: payment.status,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
      })),
      refunds: (refundsResult.data ?? []).map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        reason: refund.reason,
        status: refund.status,
        created_at: refund.created_at,
      })),
    };
  });
