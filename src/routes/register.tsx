import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LoaderCircle, MailCheck, Tag } from "lucide-react";
import { AuthCard, AuthPage, Field, PasswordField } from "@/components/skillora/auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authMessage } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getCheckoutQuote } from "@/lib/checkout.functions";
import { razorpayConfigurationMessage } from "@/lib/razorpay-test-config";
import { useServerFn } from "@tanstack/react-start";
function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name."),
    email: z.string().email("Enter a valid email address."),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]+$/, "Enter a valid mobile number.")
      .refine((value) => {
        const digitCount = value.replace(/\D/g, "").length;
        return digitCount >= 10 && digitCount <= 15;
      }, "Enter a valid mobile number."),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .regex(/[A-Z]/, "Add an uppercase letter.")
      .regex(/[a-z]/, "Add a lowercase letter.")
      .regex(/[0-9]/, "Add a number."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = search["redirect"];
    return typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")
      ? { redirect }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Create Account — AI Institute" },
      {
        name: "description",
        content: "Create one AI Institute account for learning and Affiliate Mode.",
      },
      { property: "og:title", content: "Create Account — AI Institute" },
      {
        property: "og:description",
        content: "Create one AI Institute account for learning and Affiliate Mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});
function RegisterPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const checkoutSlug = /^\/checkout\/([^/?#]+)/.exec(search.redirect ?? "")?.[1];
  const loadQuote = useServerFn(getCheckoutQuote);
  const initialPromoCode = (() => {
    const redirect = search.redirect ?? "";
    const queryIndex = redirect.indexOf("?");
    const hashIndex = redirect.indexOf("#");
    const query =
      queryIndex < 0 ? "" : redirect.slice(queryIndex + 1, hashIndex < 0 ? undefined : hashIndex);
    return new URLSearchParams(query).get("promoCode") ?? "";
  })();
  const [couponText, setCouponText] = useState(initialPromoCode);
  const [appliedCode, setAppliedCode] = useState<string | undefined>(
    initialPromoCode ? initialPromoCode.toUpperCase() : undefined,
  );
  const {
    data: quote,
    isPending: packagePending,
    isFetching,
    error: quoteError,
  } = useQuery({
    queryKey: ["registration-checkout-quote", checkoutSlug, appliedCode],
    queryFn: () => loadQuote({ data: { slug: checkoutSlug!, couponCode: appliedCode } }),
    enabled: Boolean(checkoutSlug),
    retry: false,
  });
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [continueTo, setContinueTo] = useState(search.redirect);
  const [paymentError, setPaymentError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function getContinuation(code = couponText) {
    const destination = search.redirect ?? "/dashboard";
    if (!checkoutSlug) return destination;
    const hashIndex = destination.indexOf("#");
    const pathAndSearch = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : destination.slice(hashIndex);
    const queryIndex = pathAndSearch.indexOf("?");
    const pathname = queryIndex === -1 ? pathAndSearch : pathAndSearch.slice(0, queryIndex);
    const params = new URLSearchParams(
      queryIndex === -1 ? "" : pathAndSearch.slice(queryIndex + 1),
    );
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode) params.set("promoCode", normalizedCode);
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash}`;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || loading) return;
    submitting.current = true;
    const f = new FormData(e.currentTarget);
    const result = hasSession
      ? null
      : schema.safeParse({
          fullName: f.get("fullName"),
          email: f.get("email"),
          mobile: f.get("mobile"),
          password: f.get("password"),
          confirmPassword: f.get("confirmPassword"),
        });
    if (result && !result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [String(i.path[0]), i.message])));
      submitting.current = false;
      return;
    }
    setErrors({});
    if (checkoutSlug && !quote) {
      setPaymentError("Package pricing is still loading. Please try again.");
      submitting.current = false;
      return;
    }
    if (
      checkoutSlug &&
      couponText.trim() &&
      (appliedCode !== couponText.trim().toUpperCase() || quote?.coupon.status !== "valid")
    ) {
      setPaymentError("Apply a valid promo code or remove it before continuing.");
      submitting.current = false;
      return;
    }
    if (checkoutSlug && quote?.razorpayEnabled !== true) {
      setPaymentError(
        quote
          ? razorpayConfigurationMessage(quote.razorpayStatus)
          : "Razorpay TEST checkout configuration is unavailable.",
      );
      submitting.current = false;
      return;
    }
    const destination = getContinuation(couponText);
    const returnToPurchase = checkoutSlug
      ? `/register?redirect=${encodeURIComponent(destination)}`
      : destination;
    setContinueTo(returnToPurchase);
    setLoading(true);
    setPaymentError("");
    try {
      if (!hasSession) {
        const { data, error } = await supabase.auth.signUp({
          email: result!.data.email,
          password: result!.data.password,
          options: {
            emailRedirectTo: checkoutSlug
              ? new URL(returnToPurchase, window.location.origin).toString()
              : window.location.origin,
            data: {
              full_name: result!.data.fullName,
              mobile: result!.data.mobile,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Check your email to confirm your account.");
          return;
        }
        setHasSession(true);
      }

      if (checkoutSlug) {
        const refreshedQuote = await loadQuote({
          data: { slug: checkoutSlug, couponCode: appliedCode },
        });
        if (!refreshedQuote.razorpayEnabled) {
          setPaymentError(razorpayConfigurationMessage(refreshedQuote.razorpayStatus));
          return;
        }
        if (couponText.trim() && refreshedQuote.coupon.status !== "valid") {
          setPaymentError(refreshedQuote.coupon.message);
          return;
        }
        const promoCode =
          refreshedQuote.coupon.status === "valid" ? refreshedQuote.coupon.code : null;
        await navigate({
          to: "/checkout/$slug",
          params: { slug: checkoutSlug },
          search: promoCode ? { promoCode } : {},
        });
      } else {
        toast.success("Your AI Institute account is ready.");
        await navigate({ to: destination });
      }
    } catch (error) {
      const message = authMessage(error);
      setPaymentError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  }
  const purchaseReturn = checkoutSlug
    ? `/register?redirect=${encodeURIComponent(getContinuation(couponText))}`
    : continueTo;
  if (sent)
    return (
      <AuthPage>
        <div className="rounded-lg bg-surface p-8 text-center border border-line">
          <MailCheck className="mx-auto size-10 text-success" />
          <h1 className="mt-5 font-display text-3xl font-bold">Check your email</h1>
          <p className="mt-3 text-muted-foreground">
            Open the confirmation link to activate your account. You will return here to continue to
            Razorpay TEST checkout.
          </p>
          <Button asChild className="mt-7">
            <Link to="/login" search={purchaseReturn ? { redirect: purchaseReturn } : {}}>
              Back to login
            </Link>
          </Button>
        </div>
      </AuthPage>
    );
  return (
    <AuthPage wide>
      <AuthCard
        title="Create your account"
        subtitle={
          checkoutSlug && hasSession
            ? "Your account is ready. Review the promo code and continue to Razorpay TEST checkout."
            : checkoutSlug
              ? "Register and continue to secure Razorpay TEST checkout."
              : "One account for Student and Affiliate modes."
        }
        onSubmit={(event) => void submit(event)}
      >
        {checkoutSlug && (
          <section className="grid gap-3 rounded-md border border-line bg-secondary p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Selected package
              </p>
              <p className="mt-1 font-semibold">
                {packagePending ? "Loading package…" : quote?.package.name || "Package unavailable"}
              </p>
              {quote?.package.description && (
                <p className="mt-1 text-sm text-muted-foreground">{quote.package.description}</p>
              )}
            </div>
            {quote && (
              <div className="border-t border-line pt-3">
                <p className="text-sm font-semibold">
                  {quote.package.courses.length} included course
                  {quote.package.courses.length === 1 ? "" : "s"}
                </p>
                {quote.package.courses.length ? (
                  <ul className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {quote.package.courses.map((course) => (
                      <li key={course.id}>{course.title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No published courses are currently included.
                  </p>
                )}
              </div>
            )}
            {quoteError && (
              <p role="alert" className="text-sm text-destructive">
                {quoteError.message}
              </p>
            )}
          </section>
        )}
        {(!checkoutSlug || !hasSession) && (
          <>
            <Field
              name="fullName"
              autoComplete="name"
              label="Full name"
              placeholder="Your full name"
              error={errors["fullName"]}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                name="email"
                type="email"
                autoComplete="email"
                label="Email address"
                placeholder="you@example.com"
                error={errors["email"]}
              />
              <Field
                name="mobile"
                type="tel"
                autoComplete="tel"
                label="Mobile number"
                placeholder="+91 9876543210"
                error={errors["mobile"]}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <PasswordField
                name="password"
                autoComplete="new-password"
                label="Password"
                error={errors["password"]}
              />
              <PasswordField
                name="confirmPassword"
                autoComplete="new-password"
                label="Confirm password"
                error={errors["confirmPassword"]}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use 8+ characters with uppercase, lowercase, and a number.
            </p>
          </>
        )}
        {checkoutSlug && hasSession && (
          <p className="rounded-md border border-line bg-secondary p-4 text-sm">
            Signed in. Continue to Razorpay TEST checkout without creating another account.
          </p>
        )}
        {checkoutSlug && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="registration-promo-code">Promo code (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="registration-promo-code"
                  value={couponText}
                  autoComplete="off"
                  maxLength={40}
                  placeholder="Enter your promo code"
                  aria-describedby="registration-promo-feedback"
                  onChange={(event) => {
                    setCouponText(event.target.value);
                    if (appliedCode) setAppliedCode(undefined);
                    setPaymentError("");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!couponText.trim() || isFetching}
                  onClick={() => setAppliedCode(couponText.trim().toUpperCase() || undefined)}
                >
                  {isFetching ? <LoaderCircle className="animate-spin" /> : <Tag />}
                  Apply Code
                </Button>
              </div>
              {quote?.coupon.status === "valid" && appliedCode && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit px-0"
                  onClick={() => {
                    setCouponText("");
                    setAppliedCode(undefined);
                    setPaymentError("");
                  }}
                >
                  Remove Code
                </Button>
              )}
              <p
                id="registration-promo-feedback"
                role={
                  quote?.coupon.status === "valid" ? "status" : appliedCode ? "alert" : undefined
                }
                className={`text-xs ${quote?.coupon.status === "valid" ? "text-success" : appliedCode ? "text-destructive" : "text-muted-foreground"}`}
              >
                {isFetching
                  ? "Checking promo code…"
                  : (quote?.coupon.message ?? "Enter a promo code to check its discount.")}
              </p>
            </div>
            {quote && (
              <section className="grid gap-3 rounded-md border border-line bg-surface p-4 text-sm">
                <h2 className="font-display text-lg font-bold">Price Summary</h2>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Original Price</span>
                  <span>{formatMoney(quote.package.original_price)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Selling Price</span>
                  <span>{formatMoney(quote.package.package_price)}</span>
                </div>
                {quote.coupon.status === "valid" && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Affiliate promo code</span>
                    <span className="text-right">Selling price applies</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
                  <span>Final Payable Amount</span>
                  <span className="text-primary">{formatMoney(quote.total)}</span>
                </div>
              </section>
            )}
            <section className="grid gap-3 rounded-md border border-primary/30 bg-secondary p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                Razorpay TEST MODE
              </p>
              {quote?.razorpayEnabled ? (
                <p className="text-sm text-muted-foreground">
                  Continue to Razorpay hosted checkout using a TEST order. TEST payments do not
                  grant course access or create affiliate commissions or wallet credits.
                </p>
              ) : (
                <p className="text-sm text-destructive">
                  {quote
                    ? razorpayConfigurationMessage(quote.razorpayStatus)
                    : "Razorpay TEST checkout configuration is unavailable."}
                </p>
              )}
              <Button
                type="submit"
                variant="accent"
                disabled={
                  loading ||
                  packagePending ||
                  isFetching ||
                  !quote ||
                  !quote.razorpayEnabled ||
                  (Boolean(couponText.trim()) &&
                    (appliedCode !== couponText.trim().toUpperCase() ||
                      quote.coupon.status !== "valid"))
                }
              >
                {loading && <LoaderCircle className="animate-spin" />}
                {loading
                  ? "Preparing Razorpay checkout…"
                  : hasSession
                    ? `Continue to Razorpay TEST checkout · ${formatMoney(quote?.total ?? 0)}`
                    : `Create Account & Continue · ${formatMoney(quote?.total ?? 0)}`}
              </Button>
            </section>
            {paymentError && (
              <p role="alert" className="text-sm text-destructive">
                {paymentError}
              </p>
            )}
          </>
        )}
        {!checkoutSlug && (
          <Button disabled={loading} variant="accent">
            {loading && <LoaderCircle className="animate-spin" />}
            {loading ? "Creating account…" : "Create Account"}
          </Button>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link
            to="/login"
            search={search.redirect ? { redirect: purchaseReturn ?? getContinuation() } : {}}
            className="font-semibold text-brand"
          >
            Log in
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
