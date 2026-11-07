import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getDemoPaymentReceipt } from "@/lib/checkout.functions";

export const Route = createFileRoute("/checkout/demo/$paymentId")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "Demo Payment Receipt — AI Institute" },
      { name: "description", content: "Demo-only package checkout receipt." },
    ],
  }),
  component: DemoReceipt,
});

function DemoReceipt() {
  const { paymentId } = Route.useParams();
  const loadReceipt = useServerFn(getDemoPaymentReceipt);
  const { data, isPending, error } = useQuery({
    queryKey: ["demo-payment-receipt", paymentId],
    queryFn: () => loadReceipt({ data: { paymentId } }),
    retry: false,
  });
  const successful = data?.status === "demo_success";
  const amount = data
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(data.amount)
    : "";

  return (
    <DashboardShell mode="student">
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading demo receipt…</p>
      ) : error || !data ? (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-bold">Receipt unavailable</h1>
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "This demo payment receipt could not be found for your account."}
          </p>
        </section>
      ) : (
        <section className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-6 sm:p-8">
          {successful ? (
            <CheckCircle2 className="size-10 text-primary" />
          ) : (
            <XCircle className="size-10 text-destructive" />
          )}
          <p className="mt-5 text-xs font-bold uppercase tracking-wider text-primary">
            Demo Payment · Testing Only
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {successful ? "Demo Payment Successful" : "Demo Payment Failed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {successful
              ? "This is a simulated result only. No money was collected."
              : "This simulated payment was not completed. No money was collected."}
          </p>
          <dl className="mt-6 grid gap-4 border-y border-line py-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Package</dt>
              <dd className="mt-1 font-semibold">{data.packageName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Demo amount</dt>
              <dd className="mt-1 font-semibold">{amount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payment status</dt>
              <dd className="mt-1 font-semibold">{data.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Demo transaction reference</dt>
              <dd className="mt-1 break-all font-mono text-xs">{data.reference}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-md bg-secondary p-4 text-sm">
            Demo orders never grant course access or generate affiliate commissions. A real verified
            payment is required to unlock purchased courses.
          </p>
          <Button asChild className="mt-6">
            <Link to="/packages">Return to packages</Link>
          </Button>
        </section>
      )}
    </DashboardShell>
  );
}
