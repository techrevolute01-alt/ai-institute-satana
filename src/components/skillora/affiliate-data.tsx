import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAffiliate } from "@/lib/affiliate.functions";

export function useMyAffiliate() {
  const load = useServerFn(getMyAffiliate);
  return useQuery({ queryKey: ["my-affiliate"], queryFn: () => load() });
}

export function totals(d: ReturnType<typeof useMyAffiliate>["data"]) {
  const c = d?.commissions ?? [];
  const sum = (f: (x: (typeof c)[number]) => boolean) =>
    c.filter(f).reduce((s, x) => s + x.amount, 0);
  return {
    sales: c.length,
    referrals: d?.referrals ?? 0,
    successfulPurchases: d?.successfulPurchases ?? c.length,
    commission: sum(() => true),
    pending: sum((x) => x.status === "pending"),
    approved: sum((x) => x.status === "approved" || x.status === "paid"),
    paid: c.reduce((total, x) => total + x.paid_amount, 0),
    available: d?.wallet?.available_balance ?? 0,
    pendingPayouts: (d?.payouts ?? [])
      .filter((p) => p.status === "pending")
      .reduce((s, p) => s + p.amount, 0),
  };
}
