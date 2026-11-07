import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

type Ctx = { supabase: TypedSupabaseClient; userId: string };
async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
async function userMap(sb: TypedSupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, { full_name: string; email: string | null }>();
  const { data } = await sb.from("users").select("id, full_name, email").in("id", ids);
  return new Map<string, { full_name: string; email: string | null }>(
    (data ?? []).map((u) => [u.id, u]),
  );
}

// ---------- Students ----------
export type StudentRow = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  account_status: string;
  created_at: string;
};
export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("users")
      .select("id, full_name, email, mobile, account_status, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    fail(error);
    return (data ?? []) as StudentRow[];
  });
export const setStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId)
      throw new Error("You cannot change your own account status.");
    const { error } = await (
      await admin()
    )
      .from("users")
      .update({ account_status: data.status })
      .eq("id", data.userId);
    fail(error);
    return { ok: true };
  });

// ---------- Affiliates ----------
export type AffiliateRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  status: string;
  referral_code: string | null;
  created_at: string;
};
export const listAffiliates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AffiliateRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("affiliate_profiles")
      .select("id, user_id, status, referral_code, created_at")
      .order("created_at", { ascending: false });
    fail(error);
    const m = await userMap(
      context.supabase,
      (data ?? []).map((a) => a.user_id),
    );
    return (data ?? []).map((a) => ({
      ...a,
      full_name: m.get(a.user_id)?.full_name ?? "—",
      email: m.get(a.user_id)?.email ?? null,
    }));
  });
export const reviewAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: prof, error } = await sb
      .from("affiliate_profiles")
      .select("id, user_id, referral_code")
      .eq("id", data.id)
      .single();
    fail(error);
    if (!prof) throw new Error("Affiliate profile not found.");
    if (data.approve) {
      const code =
        prof.referral_code ??
        `SK${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      fail(
        (
          await sb
            .from("affiliate_profiles")
            .update({ status: "approved", referral_code: code })
            .eq("id", data.id)
        ).error,
      );
      const { data: w } = await sb
        .from("affiliate_wallet")
        .select("id")
        .eq("affiliate_id", data.id)
        .maybeSingle();
      if (!w) fail((await sb.from("affiliate_wallet").insert({ affiliate_id: data.id })).error);
      fail(
        (
          await context.supabase
            .from("user_roles")
            .upsert(
              { user_id: prof.user_id, role: "affiliate" },
              { onConflict: "user_id,role", ignoreDuplicates: true },
            )
        ).error,
      );
    } else {
      fail(
        (await sb.from("affiliate_profiles").update({ status: "rejected" }).eq("id", data.id))
          .error,
      );
      fail(
        (
          await context.supabase
            .from("user_roles")
            .delete()
            .eq("user_id", prof.user_id)
            .eq("role", "affiliate")
        ).error,
      );
    }
    return { ok: true };
  });

// ---------- Promo codes ----------
export const promoSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Code must be at least 3 characters")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _ only"),
  discount_value: z.number({ message: "Enter a valid number" }).min(0).max(1_000_000),
  affiliate_id: z.string().uuid().nullable(),
  active: z.boolean(),
});
export type PromoRow = z.infer<typeof promoSchema> & {
  id: string;
  created_at: string;
  uses: number;
};
export const listPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PromoRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("promo_codes")
      .select("id, code, discount_value, affiliate_id, active, created_at, promo_code_usage(count)")
      .order("created_at", { ascending: false });
    fail(error);
    return (data ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      discount_value: Number(p.discount_value),
      affiliate_id: p.affiliate_id,
      active: p.active,
      created_at: p.created_at,
      uses: p.promo_code_usage?.[0]?.count ?? 0,
    }));
  });
export const savePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid().optional(), values: promoSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const row = { ...data.values, code: data.values.code.toUpperCase() };
    const { error } = data.id
      ? await context.supabase.from("promo_codes").update(row).eq("id", data.id)
      : await context.supabase.from("promo_codes").insert(row);
    if (error)
      throw new Error(error.code === "23505" ? "This promo code already exists." : error.message);
    return { ok: true };
  });
export const deletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("promo_codes").delete().eq("id", data.id);
    if (error)
      throw new Error(
        error.code === "23503"
          ? "This code has been used on orders. Turn it off instead."
          : error.message,
      );
    return { ok: true };
  });

// ---------- Commissions & withdrawals ----------
export type CommissionRow = {
  id: string;
  affiliate: string;
  order_id: string;
  amount: number;
  package_name: string | null;
  purchase_date: string | null;
  commission_type: string;
  commission_value: number;
  status: string;
  created_at: string;
};
async function affNames(sb: TypedSupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await sb.from("affiliate_profiles").select("id, user_id").in("id", ids);
  const um = await userMap(
    sb,
    (data ?? []).map((a) => a.user_id),
  );
  return new Map<string, string>(
    (data ?? []).map((a) => [
      a.id,
      um.get(a.user_id)?.full_name || um.get(a.user_id)?.email || "Affiliate",
    ]),
  );
}
export const listCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommissionRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("affiliate_commissions")
      .select(
        "id, affiliate_id, order_id, amount, package_name, purchase_date, commission_type, commission_value, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    fail(error);
    const n = await affNames(context.supabase, [
      ...new Set((data ?? []).map((c) => c.affiliate_id)),
    ]);
    return (data ?? []).map((c) => ({
      id: c.id,
      affiliate: n.get(c.affiliate_id) ?? "Affiliate",
      order_id: c.order_id,
      amount: Number(c.amount),
      package_name: c.package_name,
      purchase_date: c.purchase_date,
      commission_type: c.commission_type,
      commission_value: Number(c.commission_value),
      status: c.status,
      created_at: c.created_at,
    }));
  });
export const reviewCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await (
      await admin()
    ).rpc("approve_affiliate_commission", {
      _commission_id: data.id,
    });
    fail(error);
    return { ok: true };
  });
export type PayoutRow = {
  id: string;
  affiliate: string;
  amount: number;
  status: string;
  requested_at: string;
  processed_at: string | null;
};
export const listPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayoutRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("affiliate_payouts")
      .select("id, affiliate_id, amount, status, requested_at, processed_at")
      .order("requested_at", { ascending: false })
      .limit(500);
    fail(error);
    const n = await affNames(context.supabase, [
      ...new Set((data ?? []).map((c) => c.affiliate_id)),
    ]);
    return (data ?? []).map((p) => ({
      id: p.id,
      affiliate: n.get(p.affiliate_id) ?? "Affiliate",
      amount: Number(p.amount),
      status: p.status,
      requested_at: p.requested_at,
      processed_at: p.processed_at,
    }));
  });
export const reviewPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { error } = await sb.rpc("process_affiliate_payout", {
      _payout_id: data.id,
      _approve: data.approve,
    });
    fail(error);
    return { ok: true };
  });

// ---------- Orders & payments (read-only; payments are not live yet) ----------
export type OrderRow = {
  id: string;
  customer: string;
  email: string | null;
  total: number;
  currency: string;
  status: string;
  created_at: string;
  items: string;
};
export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, user_id, total, currency, status, created_at, order_items(title)")
      .order("created_at", { ascending: false })
      .limit(500);
    fail(error);
    const m = await userMap(context.supabase, [...new Set((data ?? []).map((o) => o.user_id))]);
    return (data ?? []).map((o) => ({
      id: o.id,
      customer: m.get(o.user_id)?.full_name || "—",
      email: m.get(o.user_id)?.email ?? null,
      total: Number(o.total),
      currency: o.currency,
      status: o.status,
      created_at: o.created_at,
      items: (o.order_items ?? []).map((i) => i.title).join(", "),
    }));
  });
export type PaymentRow = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_reference: string | null;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};
export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentRow[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("payments")
      .select("id, order_id, provider, provider_reference, amount, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    fail(error);
    return (data ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  });
