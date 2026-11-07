import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyAffiliate = {
  profile: { id: string; status: string; referral_code: string | null } | null;
  wallet: { available_balance: number; pending_balance: number } | null;
  clicks: number;
  leads: number;
  referrals: number;
  successfulPurchases: number;
  promoCodes: { id: string; code: string; discount_value: number; active: boolean; uses: number }[];
  commissions: {
    id: string;
    order_id: string;
    amount: number;
    status: string;
    created_at: string;
    package_name: string | null;
    purchase_date: string | null;
    commission_type: string;
    commission_value: number;
    payment_amount: number;
    refunded_amount: number;
    paid_amount: number;
  }[];
  payouts: {
    id: string;
    amount: number;
    status: string;
    requested_at: string;
    processed_at: string | null;
  }[];
  transactions: { id: string; amount: number; transaction_type: string; created_at: string }[];
};

// All reads run as the signed-in user; RLS limits rows to their own affiliate profile.
export const getMyAffiliate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAffiliate> => {
    const sb = context.supabase;
    const { data: profile } = await sb
      .from("affiliate_profiles")
      .select("id, status, referral_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    const empty: MyAffiliate = {
      profile,
      wallet: null,
      clicks: 0,
      leads: 0,
      referrals: 0,
      successfulPurchases: 0,
      promoCodes: [],
      commissions: [],
      payouts: [],
      transactions: [],
    };
    if (!profile) return empty;
    const id = profile.id;
    const [w, c, l, p, cm, po] = await Promise.all([
      sb
        .from("affiliate_wallet")
        .select("id, available_balance, pending_balance")
        .eq("affiliate_id", id)
        .maybeSingle(),
      sb
        .from("affiliate_clicks")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_id", id),
      sb
        .from("affiliate_leads")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_id", id),
      sb
        .from("promo_codes")
        .select("id, code, discount_value, active, promo_code_usage(count)")
        .eq("affiliate_id", id),
      sb
        .from("affiliate_commissions")
        .select(
          "id, order_id, amount, status, created_at, package_name, purchase_date, commission_type, commission_value, payment_amount, refunded_amount, paid_amount",
          { count: "exact" },
        )
        .eq("affiliate_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
      sb
        .from("affiliate_payouts")
        .select("id, amount, status, requested_at, processed_at")
        .eq("affiliate_id", id)
        .order("requested_at", { ascending: false })
        .limit(500),
    ]);
    for (const result of [w, c, l, p, cm, po]) {
      if (result.error) throw new Error(result.error.message);
    }
    const tx = w.data
      ? await sb
          .from("wallet_transactions")
          .select("id, amount, transaction_type, created_at")
          .eq("wallet_id", w.data.id)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };
    if ("error" in tx && tx.error) throw new Error(tx.error.message);
    return {
      profile,
      wallet: w.data
        ? {
            available_balance: Number(w.data.available_balance),
            pending_balance: Number(w.data.pending_balance),
          }
        : null,
      clicks: c.count ?? 0,
      leads: l.count ?? 0,
      referrals: (p.data ?? []).reduce(
        (total, promo) => total + (promo.promo_code_usage?.[0]?.count ?? 0),
        0,
      ),
      successfulPurchases: cm.count ?? (cm.data ?? []).length,
      promoCodes: (p.data ?? []).map((x) => ({
        id: x.id,
        code: x.code,
        discount_value: Number(x.discount_value),
        active: x.active,
        uses: x.promo_code_usage?.[0]?.count ?? 0,
      })),
      commissions: (cm.data ?? []).map((x) => ({
        ...x,
        amount: Number(x.amount),
        commission_value: Number(x.commission_value),
        payment_amount: Number(x.payment_amount),
        refunded_amount: Number(x.refunded_amount),
        paid_amount: Number(x.paid_amount),
      })),
      payouts: (po.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })),
      transactions: (tx.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })),
    };
  });

export const requestAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("affiliate_profiles")
      .insert({ user_id: context.userId, status: "pending" });
    if (error)
      throw new Error(
        error.code === "23505" ? "You have already requested Affiliate Mode." : error.message,
      );
    return { ok: true };
  });

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ amount: z.number().positive("Enter an amount greater than zero").max(10_000_000) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const { data: prof } = await sb
      .from("affiliate_profiles")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!prof || prof.status !== "approved")
      throw new Error("Your affiliate account is not active.");
    // Database trigger re-checks balance minus pending requests.
    const { error } = await sb
      .from("affiliate_payouts")
      .insert({ affiliate_id: prof.id, amount: data.amount, status: "pending" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
