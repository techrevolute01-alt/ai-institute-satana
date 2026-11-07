import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, Loader2, Tag } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSnapshot } from "@/lib/auth";
import { razorpayConfigurationMessage } from "@/lib/razorpay-test-config";
import {
  cancelRazorpayTestPayment,
  createRazorpayTestOrder,
  getCheckoutQuote,
  recordRazorpayTestFailure,
  verifyRazorpayTestPayment,
} from "@/lib/checkout.functions";

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayFailureResponse = {
  error?: {
    metadata?: { payment_id?: string; order_id?: string };
  };
};
type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; email?: string; contact?: string };
  handler: (response: RazorpaySuccessResponse) => void | Promise<void>;
  modal: { ondismiss: () => void | Promise<void> };
};
type RazorpayCheckout = {
  open(): void;
  on(event: "payment.failed", callback: (response: RazorpayFailureResponse) => void): void;
};
type RazorpayWindow = Window & {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
};

function loadRazorpayCheckout() {
  return new Promise<boolean>((resolve) => {
    const checkoutWindow = window as RazorpayWindow;
    if (checkoutWindow.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(checkoutWindow.Razorpay)), {
        once: true,
      });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(checkoutWindow.Razorpay));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export const Route = createFileRoute("/checkout/$slug")({
  validateSearch: (search: Record<string, unknown>): { promoCode?: string } => {
    const promoCode = search["promoCode"];
    return typeof promoCode === "string" && promoCode.length <= 40 ? { promoCode } : {};
  },
  beforeLoad: async ({ location }) => {
    const auth = await getAuthSnapshot();
    if (!auth) {
      throw redirect({
        to: "/register",
        search: { redirect: location.href },
      });
    }
    if (!auth.roles.includes("student") && !auth.roles.includes("admin")) {
      throw redirect({ to: "/unauthorized" });
    }
  },
  head: () => ({
    meta: [
      { title: "Checkout — AI Institute" },
      { name: "description", content: "Review your AI Institute package order summary." },
    ],
  }),
  component: Page,
});

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function Page() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const loadQuote = useServerFn(getCheckoutQuote);
  const startRazorpayOrder = useServerFn(createRazorpayTestOrder);
  const confirmRazorpayPayment = useServerFn(verifyRazorpayTestPayment);
  const cancelRazorpayPayment = useServerFn(cancelRazorpayTestPayment);
  const failRazorpayPayment = useServerFn(recordRazorpayTestFailure);
  const [couponText, setCouponText] = useState(search.promoCode ?? "");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(search.promoCode);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ["checkout-quote", slug, appliedCode],
    queryFn: () => loadQuote({ data: { slug, couponCode: appliedCode } }),
    retry: false,
  });

  async function startPayment() {
    if (!data?.razorpayEnabled || paymentSubmitting) return;
    if (appliedCode && data.coupon.status !== "valid") {
      setPaymentError("Enter a valid promo code or remove it before continuing.");
      return;
    }
    setPaymentSubmitting(true);
    setPaymentError("");
    let paymentId: string | undefined;
    let finished = false;
    try {
      const order = await startRazorpayOrder({
        data: {
          slug,
          promoCode: data.coupon.status === "valid" ? data.coupon.code : null,
        },
      });
      paymentId = order.paymentId;
      if (!(await loadRazorpayCheckout())) {
        await cancelRazorpayPayment({ data: { paymentId } });
        throw new Error("Razorpay Checkout could not be loaded. Please try again.");
      }

      const checkoutWindow = window as RazorpayWindow;
      if (!checkoutWindow.Razorpay) {
        await cancelRazorpayPayment({ data: { paymentId } });
        throw new Error("Razorpay Checkout is unavailable. Please try again.");
      }

      const checkout = new checkoutWindow.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "AI Institute Satana",
        description: data.package.name,
        order_id: order.orderId,
        prefill: {
          ...(data.profile?.full_name ? { name: data.profile.full_name } : {}),
          ...(data.profile?.email ? { email: data.profile.email } : {}),
          ...(data.profile?.mobile ? { contact: data.profile.mobile } : {}),
        },
        handler: async (response) => {
          try {
            await confirmRazorpayPayment({
              data: {
                paymentId: order.paymentId,
                razorpayPaymentId: response.razorpay_payment_id,
                orderId: response.razorpay_order_id,
                signature: response.razorpay_signature,
              },
            });
            finished = true;
            await navigate({
              to: "/checkout/payment/$paymentId",
              params: { paymentId: order.paymentId },
            });
          } catch (error) {
            setPaymentError(
              error instanceof Error
                ? error.message
                : "The payment could not be verified. Please contact support before retrying.",
            );
          } finally {
            setPaymentSubmitting(false);
          }
        },
        modal: {
          ondismiss: async () => {
            if (finished) return;
            try {
              await cancelRazorpayPayment({ data: { paymentId: order.paymentId } });
              finished = true;
              await navigate({
                to: "/checkout/payment/$paymentId",
                params: { paymentId: order.paymentId },
              });
            } catch (error) {
              setPaymentError(
                error instanceof Error ? error.message : "The payment could not be cancelled.",
              );
            } finally {
              setPaymentSubmitting(false);
            }
          },
        },
      });
      checkout.on("payment.failed", async (response) => {
        const failedPaymentId = response.error?.metadata?.payment_id;
        const failedOrderId = response.error?.metadata?.order_id;
        if (!failedPaymentId || !failedOrderId) {
          setPaymentError("Razorpay did not provide failure details. Please contact support.");
          setPaymentSubmitting(false);
          return;
        }
        try {
          await failRazorpayPayment({
            data: {
              paymentId: order.paymentId,
              orderId: failedOrderId,
              razorpayPaymentId: failedPaymentId,
            },
          });
          finished = true;
          await navigate({
            to: "/checkout/payment/$paymentId",
            params: { paymentId: order.paymentId },
          });
        } catch (error) {
          setPaymentError(
            error instanceof Error ? error.message : "The failed payment could not be recorded.",
          );
        } finally {
          setPaymentSubmitting(false);
        }
      });
      checkout.open();
    } catch (error) {
      if (paymentId) {
        try {
          await cancelRazorpayPayment({ data: { paymentId } });
        } catch {
          setPaymentError(
            "Checkout could not start, and the pending order could not be cancelled. Please contact support.",
          );
        }
      }
      setPaymentError(
        error instanceof Error ? error.message : "Razorpay checkout could not be started.",
      );
      setPaymentSubmitting(false);
    }
  }

  return (
    <DashboardShell mode="student">
      <p className="text-xs font-semibold uppercase text-accent">Package checkout</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Complete your purchase</h1>
      <p className="mt-2 text-muted-foreground">
        Your selected package is already set. Review the price and payment status before continuing.
      </p>

      {isPending ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading package and pricing…
        </p>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-line bg-surface p-6">
          <h2 className="font-semibold">Checkout details unavailable</h2>
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error.message}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/packages/$slug" params={{ slug }}>
              Return to package
            </Link>
          </Button>
        </div>
      ) : data ? (
        <div className="mt-8 grid gap-6">
          <section className="grid content-start gap-5">
            <article className="overflow-hidden rounded-lg border border-line bg-surface">
              {data.package.thumbnail_url && (
                <img
                  src={data.package.thumbnail_url}
                  alt=""
                  className="aspect-[16/7] w-full object-cover"
                />
              )}
              <div className="grid gap-4 p-5 sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase text-accent">Selected package</p>
                  <h2 className="mt-2 font-display text-2xl font-bold">{data.package.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{data.package.description}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Included courses</h3>
                  {data.package.courses.length ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {data.package.courses.map((course) => (
                        <li key={course.id} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" />
                          {course.title}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No published courses are currently included.
                    </p>
                  )}
                </div>
              </div>
            </article>

            <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold">Account details</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Name</dt>
                  <dd>{data.profile?.full_name || "Add your name to your profile"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd>{data.profile?.email || "Email unavailable"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mobile number</dt>
                  <dd>{data.profile?.mobile || "Add your number to your profile"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Need to use another account?{" "}
                <Link
                  to="/login"
                  search={{
                    redirect: appliedCode
                      ? `/checkout/${slug}?promoCode=${encodeURIComponent(appliedCode)}`
                      : `/checkout/${slug}`,
                  }}
                  className="font-semibold text-primary"
                >
                  Sign in
                </Link>
              </p>
            </section>
          </section>

          <aside className="h-fit rounded-lg bg-surface p-5 border border-line lg:sticky lg:top-8 sm:p-6">
            <form
              className="mt-6 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const normalized = couponText.trim().toUpperCase();
                setPaymentError("");
                setAppliedCode(normalized || undefined);
              }}
            >
              <Label htmlFor="coupon-code">Promo code</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon-code"
                  value={couponText}
                  onChange={(event) => {
                    setCouponText(event.target.value);
                    setPaymentError("");
                    if (appliedCode) setAppliedCode(undefined);
                  }}
                  autoComplete="off"
                  maxLength={40}
                  placeholder="Enter code"
                  aria-describedby="coupon-feedback"
                />
                <Button type="submit" variant="outline" disabled={!couponText.trim() || isFetching}>
                  <Tag className="size-4" />
                  Apply Code
                </Button>
              </div>
              {data.coupon.status === "valid" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit px-0 text-sm"
                  onClick={() => {
                    setCouponText("");
                    setAppliedCode(undefined);
                  }}
                  disabled={isFetching}
                >
                  Remove Code
                </Button>
              )}
              <p
                id="coupon-feedback"
                role={
                  data.coupon.status === "valid"
                    ? "status"
                    : ["invalid", "inactive", "expired", "affiliate_unavailable"].includes(
                          data.coupon.status,
                        )
                      ? "alert"
                      : undefined
                }
                className={`text-xs ${data.coupon.status === "valid" ? "text-success" : ["invalid", "inactive", "expired", "affiliate_unavailable"].includes(data.coupon.status) ? "text-destructive" : "text-muted-foreground"}`}
              >
                {isFetching ? "Checking promo code and updating price…" : data.coupon.message}
              </p>
            </form>

            <h2 className="mt-6 font-display text-xl font-bold">Payment Summary</h2>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Selected package</span>
                <span className="text-right font-semibold">{data.package.name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Original price</span>
                <span>{money(data.package.original_price, data.currency)}</span>
              </div>
              {data.coupon.status === "valid" && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Selling price</span>
                  <span>{money(data.package.package_price, data.currency)}</span>
                </div>
              )}
              {data.coupon.status === "valid" && data.razorpayEnabled && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    Affiliate promo code ({data.coupon.code})
                  </span>
                  <span className="text-right">Selling price applies</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-4 text-base font-bold">
                <span>Final payable amount</span>
                <span className="text-xl text-primary">{money(data.total, data.currency)}</span>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-line bg-secondary p-4">
              <p className="flex items-center gap-2 font-semibold">
                <CreditCard className="size-4" />
                Payment mode
              </p>
              <p className="mt-2 text-sm">
                {data.razorpayEnabled ? "RAZORPAY TEST MODE" : "Online payment unavailable"}
              </p>
            </div>
            {data.razorpayEnabled ? (
              <section className="mt-4 rounded-md border border-primary/30 bg-secondary p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Razorpay TEST MODE · Testing Only
                </p>
                <p className="mt-2 text-sm">
                  The server validates the package price and promo code, creates a Razorpay order,
                  and verifies the payment signature and captured amount before marking the order
                  paid. TEST payments do not grant course access or generate affiliate commissions.
                </p>
                {data.commissionPreview && (
                  <p className="mt-2 text-sm">
                    Test calculation only:{" "}
                    {data.commissionPreview.type === "percentage"
                      ? `${data.commissionPreview.value}%`
                      : money(data.commissionPreview.value, data.currency)}{" "}
                    commission would be {money(data.commissionPreview.amount, data.currency)} on
                    this purchase. This demo will not create or pay a commission.
                  </p>
                )}
                <div className="mt-4 grid gap-2">
                  <Button
                    className="w-full"
                    disabled={
                      paymentSubmitting ||
                      isFetching ||
                      Boolean(appliedCode && data.coupon.status !== "valid")
                    }
                    onClick={startPayment}
                  >
                    {paymentSubmitting && <Loader2 className="size-4 animate-spin" />}
                    {paymentSubmitting ? "Opening Razorpay…" : "Pay Now · Razorpay Test"}
                  </Button>
                </div>
                {paymentError && (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    {paymentError}
                  </p>
                )}
              </section>
            ) : (
              <p className="mt-4 rounded-md border border-line bg-secondary p-4 text-sm">
                {razorpayConfigurationMessage(data.razorpayStatus)} Live payments are disabled.
              </p>
            )}
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/packages/$slug" params={{ slug }}>
                Return to package
              </Link>
            </Button>
          </aside>
        </div>
      ) : null}
    </DashboardShell>
  );
}
