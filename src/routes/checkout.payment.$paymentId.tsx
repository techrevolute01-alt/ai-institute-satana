import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getRazorpayTestPaymentReceipt } from "@/lib/checkout.functions";

export const Route = createFileRoute("/checkout/payment/$paymentId")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "Razorpay TEST Payment Receipt — AI Institute" },
      { name: "description", content: "Razorpay TEST MODE package payment receipt." },
    ],
  }),
  component: PaymentReceipt,
});

function PaymentReceipt() {
  const { paymentId } = Route.useParams();
  const loadReceipt = useServerFn(getRazorpayTestPaymentReceipt);
  const { data, isPending, error } = useQuery({
    queryKey: ["razorpay-test-payment-receipt", paymentId],
    queryFn: () => loadReceipt({ data: { paymentId } }),
    retry: false,
  });
  const status = data?.status;
  const successful = status === "paid";
  const cancelled = status === "cancelled";
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
        <p className="text-sm text-muted-foreground">Loading payment receipt…</p>
      ) : error || !data ? (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h1 className="font-display text-2xl font-bold">Receipt unavailable</h1>
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "This Razorpay payment receipt could not be found for your account."}
          </p>
        </section>
      ) : (
        <section className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-6 sm:p-8">
          {successful ? (
            <CheckCircle2 className="size-10 text-primary" />
          ) : cancelled ? (
            <Clock3 className="size-10 text-muted-foreground" />
          ) : (
            <XCircle className="size-10 text-destructive" />
          )}
          <p className="mt-5 text-xs font-bold uppercase tracking-wider text-primary">
            Razorpay TEST MODE · Testing Only
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {successful
              ? "Test Payment Successful"
              : cancelled
                ? "Payment Cancelled"
                : status === "pending"
                  ? "Payment Verification Pending"
                  : "Test Payment Failed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {successful
              ? "Razorpay confirmed the test payment and the server verified its signature."
              : cancelled
                ? "The Razorpay checkout was closed before a successful payment was confirmed."
                : status === "pending"
                  ? "The payment has not been marked successful. Contact support if Razorpay shows a completed payment."
                  : "Razorpay did not complete this test payment."}
          </p>
          <dl className="mt-6 grid gap-4 border-y border-line py-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Package</dt>
              <dd className="mt-1 font-semibold">{data.packageName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Test amount</dt>
              <dd className="mt-1 font-semibold">{amount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payment status</dt>
              <dd className="mt-1 font-semibold">{data.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order status</dt>
              <dd className="mt-1 font-semibold">{data.orderStatus}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Razorpay reference</dt>
              <dd className="mt-1 break-all font-mono text-xs">{data.reference || "Pending"}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-md bg-secondary p-4 text-sm">
            Test payments do not grant course access or generate affiliate commissions or wallet
            credits. A verified live payment is required to unlock purchased courses.
          </p>
          <Button asChild className="mt-6">
            <Link to="/packages">Return to packages</Link>
          </Button>
        </section>
      )}
    </DashboardShell>
  );
}
