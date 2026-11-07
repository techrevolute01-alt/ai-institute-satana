import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { requestAffiliate } from "@/lib/affiliate.functions";
import { useMyAffiliate } from "./affiliate-data";
import { Button } from "@/components/ui/button";

export function AffiliateActivateCard() {
  const qc = useQueryClient();
  const { data, isPending } = useMyAffiliate();
  const req = useServerFn(requestAffiliate);
  const m = useMutation({
    mutationFn: () => req(),
    onSuccess: () => {
      toast.success("Request sent. An admin will review it.");
      qc.invalidateQueries({ queryKey: ["my-affiliate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send request."),
  });
  const status = data?.profile?.status;
  return (
    <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
      <h2 className="font-display text-2xl font-bold">Affiliate Mode</h2>
      {isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : status === "approved" ? (
        <p className="mt-3 text-sm">
          Your affiliate account is active.{" "}
          <Link to="/affiliate" className="font-semibold underline">
            Open Affiliate Mode
          </Link>
        </p>
      ) : status === "pending" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Your request is waiting for admin approval.
        </p>
      ) : status === "rejected" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Your affiliate request was not approved. Contact AI Institute for details.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Earn by sharing AI Institute. Use the same account — no second login.
          </p>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Sending…" : "Activate Affiliate Mode"}
          </Button>
        </div>
      )}
    </section>
  );
}
