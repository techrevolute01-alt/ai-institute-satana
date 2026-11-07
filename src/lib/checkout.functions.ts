import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { calculatePromoDiscount, calculateRazorpayTestCheckoutPrice } from "@/lib/checkout-pricing";
import {
  calculateAffiliateCommission,
  type AffiliateCommissionType,
} from "@/lib/affiliate-commission";
import {
  isMissingPackageCommissionColumns,
  packageCommissionDefaults,
} from "@/lib/commission-schema";

type CheckoutProfile = { full_name: string; email: string | null; mobile: string | null };
type CheckoutPackageRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  thumbnail_url: string | null;
  original_price: number | string;
  selling_price: number | string;
  commission_type?: AffiliateCommissionType;
  commission_value?: number | string;
};
type PackageEdge = { package_id: string; included_package_id: string; sort_order: number };
type PackageCourseLink = { package_id: string; course_id: string; sort_order: number };
type CourseRow = { id: string; title: string; status: string };
type CouponRow = {
  id: string;
  code: string;
  discount_value: number | string;
  discount_type: "fixed" | "percentage";
  expires_at: string | null;
  usage_limit: number | null;
  active: boolean;
  affiliate_id: string | null;
};
type AffiliateRow = { status: string; user_id: string };
type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null; count?: number | null };
type Query<T> = PromiseLike<DbResult<T[]>> & {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): Query<T>;
  eq(column: string, value: string): Query<T>;
  in(column: string, values: string[]): Query<T>;
  order(column: string, options?: { ascending?: boolean }): Query<T>;
  maybeSingle(): PromiseLike<DbResult<T>>;
};
type CheckoutClient = {
  from(table: "packages"): Query<CheckoutPackageRow>;
  from(table: "package_includes"): Query<PackageEdge>;
  from(table: "package_courses"): Query<PackageCourseLink>;
  from(table: "courses"): Query<CourseRow>;
  from(table: "users"): Query<CheckoutProfile>;
};
type CouponClient = {
  from(table: "promo_codes"): Query<CouponRow>;
  from(table: "affiliate_profiles"): Query<AffiliateRow>;
  from(table: "promo_code_usage"): Query<{ id: string; promo_code_id: string }>;
};

const optionalCheckoutAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase checkout configuration is unavailable.");

  const request = getRequest();
  const authorization = request?.headers.get("authorization");
  let userId: string | null = null;
  if (authorization) {
    if (!authorization.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authorization.slice("Bearer ".length);
    if (token.split(".").length !== 3) throw new Error("Unauthorized");
    const verifier = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await verifier.auth.getClaims(token);
    if (error || !data?.claims?.sub) throw new Error("Unauthorized");
    userId = data.claims.sub;
  }

  const supabase = createClient<Database>(url, key, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return next({ context: { supabase, userId } });
});

export type CheckoutQuote = {
  package: {
    id: string;
    slug: string;
    name: string;
    description: string;
    thumbnail_url: string | null;
    original_price: number;
    package_price: number;
    courses: { id: string; title: string }[];
  };
  profile: CheckoutProfile | null;
  coupon: {
    code: string | null;
    status: "not_applied" | "valid" | "invalid" | "inactive" | "expired" | "affiliate_unavailable";
    discount: number;
    discountPercentage: number;
    message: string;
  };
  demoEnabled: boolean;
  razorpayEnabled: boolean;
  razorpayStatus: "ready" | "missing_key_id" | "invalid_key_id" | "missing_secret";
  commissionPreview: {
    type: AffiliateCommissionType;
    value: number;
    amount: number;
  } | null;
  total: number;
  currency: "INR";
};

export const getCheckoutQuote = createServerFn({ method: "GET" })
  .middleware([optionalCheckoutAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        couponCode: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<CheckoutQuote> => {
    const client = context.supabase as unknown as CheckoutClient;
    const [
      initialPackageResult,
      { data: profile, error: profileError },
      { data: allEdges, error: edgesError },
    ] = await Promise.all([
      client
        .from("packages")
        .select(
          "id, slug, name, description, thumbnail_url, original_price, selling_price, commission_type, commission_value",
        )
        .eq("slug", data.slug)
        .eq("status", "published")
        .maybeSingle(),
      context.userId
        ? client
            .from("users")
            .select("full_name, email, mobile")
            .eq("id", context.userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      client
        .from("package_includes")
        .select("package_id, included_package_id, sort_order")
        .order("sort_order"),
    ]);
    let packageRow = initialPackageResult.data;
    if (isMissingPackageCommissionColumns(initialPackageResult.error)) {
      const legacyPackage = await client
        .from("packages")
        .select("id, slug, name, description, thumbnail_url, original_price, selling_price")
        .eq("slug", data.slug)
        .eq("status", "published")
        .maybeSingle();
      if (legacyPackage.error) throw new Error(legacyPackage.error.message);
      packageRow = legacyPackage.data
        ? {
            ...legacyPackage.data,
            commission_type: "percentage" as const,
            commission_value: 0,
          }
        : null;
    } else if (initialPackageResult.error) {
      throw new Error(initialPackageResult.error.message);
    }
    if (profileError) throw new Error(profileError.message);
    if (edgesError) throw new Error(edgesError.message);
    if (!packageRow) throw new Error("This package is not available for checkout.");

    const reachablePackageIds = [packageRow.id];
    const seen = new Set(reachablePackageIds);
    for (let index = 0; index < reachablePackageIds.length; index += 1) {
      const currentId = reachablePackageIds[index]!;
      for (const edge of allEdges ?? []) {
        if (edge.package_id === currentId && !seen.has(edge.included_package_id)) {
          seen.add(edge.included_package_id);
          reachablePackageIds.push(edge.included_package_id);
        }
      }
    }

    const [{ data: links, error: linksError }, { data: packages, error: includedError }] =
      await Promise.all([
        client
          .from("package_courses")
          .select("package_id, course_id, sort_order")
          .in("package_id", reachablePackageIds)
          .order("sort_order"),
        client
          .from("packages")
          .select("id, slug, name, description, thumbnail_url, original_price, selling_price")
          .in("id", reachablePackageIds)
          .eq("status", "published"),
      ]);
    if (linksError) throw new Error(linksError.message);
    if (includedError) throw new Error(includedError.message);
    const availablePackageIds = new Set((packages ?? []).map((item) => item.id));
    const courseLinks = (links ?? []).filter((link) => availablePackageIds.has(link.package_id));
    const courseIds = [...new Set(courseLinks.map((link) => link.course_id))];
    const { data: courses, error: coursesError } = courseIds.length
      ? await client
          .from("courses")
          .select("id, title, status")
          .in("id", courseIds)
          .eq("status", "published")
      : { data: [], error: null };
    if (coursesError) throw new Error(coursesError.message);
    const courseById = new Map((courses ?? []).map((course) => [course.id, course]));
    const packageRank = new Map(reachablePackageIds.map((id, index) => [id, index]));
    const includedCourses = courseLinks
      .sort(
        (a, b) =>
          (packageRank.get(a.package_id) ?? 0) - (packageRank.get(b.package_id) ?? 0) ||
          a.sort_order - b.sort_order,
      )
      .flatMap((link) => {
        const course = courseById.get(link.course_id);
        return course ? [course] : [];
      })
      .filter((course, index, all) => all.findIndex((item) => item.id === course.id) === index)
      .map(({ id, title }) => ({ id, title }));

    const packagePrice = Number(packageRow.selling_price);
    const originalPrice = Number(packageRow.original_price);
    if (
      !Number.isFinite(packagePrice) ||
      !Number.isFinite(originalPrice) ||
      packagePrice < 0 ||
      originalPrice < packagePrice
    ) {
      throw new Error("The package has invalid pricing and cannot be checked out.");
    }

    let coupon: CheckoutQuote["coupon"] = {
      code: null,
      status: "not_applied",
      discount: 0,
      discountPercentage: 0,
      message: "Enter an active promo code if you have one.",
    };
    const normalizedCode = data.couponCode?.toUpperCase();
    let affiliatePromoApplied = false;
    if (normalizedCode) {
      const adminClient = (await import("@/integrations/supabase/client.server"))
        .supabaseAdmin as unknown as CouponClient;
      const { data: promo, error: promoError } = await adminClient
        .from("promo_codes")
        .select(
          "id, code, discount_value, discount_type, expires_at, usage_limit, active, affiliate_id",
        )
        .eq("code", normalizedCode)
        .maybeSingle();
      if (promoError) throw new Error(promoError.message);
      if (!promo) {
        coupon = {
          code: normalizedCode,
          status: "invalid",
          discount: 0,
          discountPercentage: 0,
          message: "Invalid promo code.",
        };
      } else if (!promo.active) {
        coupon = {
          code: promo.code,
          status: "inactive",
          discount: 0,
          discountPercentage: 0,
          message: "This promo code is inactive.",
        };
      } else if (promo.expires_at && Date.parse(promo.expires_at) <= Date.now()) {
        coupon = {
          code: promo.code,
          status: "expired",
          discount: 0,
          discountPercentage: 0,
          message: "Expired promo code.",
        };
      } else {
        let affiliateAvailable = true;
        let isSelfReferral = false;
        if (promo.affiliate_id) {
          const { data: affiliate, error: affiliateError } = await adminClient
            .from("affiliate_profiles")
            .select("status, user_id")
            .eq("id", promo.affiliate_id)
            .maybeSingle();
          if (affiliateError) throw new Error(affiliateError.message);
          affiliateAvailable = affiliate?.status === "approved";
          isSelfReferral = Boolean(context.userId && affiliate?.user_id === context.userId);
        }
        const { count: usageCount, error: usageError } = await adminClient
          .from("promo_code_usage")
          .select("id", { count: "exact", head: true })
          .eq("promo_code_id", promo.id);
        if (usageError) throw new Error(usageError.message);
        if (promo.usage_limit !== null && (usageCount ?? 0) >= promo.usage_limit) {
          coupon = {
            code: promo.code,
            status: "inactive",
            discount: 0,
            discountPercentage: 0,
            message: "This promo code has reached its usage limit.",
          };
        } else if (isSelfReferral) {
          coupon = {
            code: promo.code,
            status: "inactive",
            discount: 0,
            discountPercentage: 0,
            message: "You cannot use your own affiliate promo code.",
          };
        } else if (!affiliateAvailable) {
          coupon = {
            code: promo.code,
            status: "affiliate_unavailable",
            discount: 0,
            discountPercentage: 0,
            message: "This affiliate promo code is not currently eligible.",
          };
        } else {
          const configuredDiscount = Number(promo.discount_value);
          if (
            !Number.isFinite(configuredDiscount) ||
            configuredDiscount <= 0 ||
            (promo.discount_type === "percentage" && configuredDiscount > 100)
          ) {
            coupon = {
              code: promo.code,
              status: "invalid",
              discount: 0,
              discountPercentage: 0,
              message: "Invalid promo code.",
            };
          } else {
            affiliatePromoApplied = Boolean(promo.affiliate_id);
            const calculation = calculatePromoDiscount(
              packagePrice,
              configuredDiscount,
              promo.discount_type,
            );
            coupon = {
              code: promo.code,
              status: "valid",
              discount: calculation.amount,
              discountPercentage: calculation.percentage,
              message: "Promo code applied successfully.",
            };
          }
        }
      }
    }

    const demoEnabled = (await import("@/lib/demo-payment.server")).isDemoPaymentEnabled();
    const razorpay = await import("@/lib/razorpay-test.server");
    const razorpayStatus = razorpay.getRazorpayTestModeStatus();
    const razorpayEnabled = razorpayStatus === "ready";
    const total = calculateRazorpayTestCheckoutPrice(
      originalPrice,
      packagePrice,
      coupon.status === "valid",
    );

    return {
      package: {
        id: packageRow.id,
        slug: packageRow.slug,
        name: packageRow.name,
        description: packageRow.description,
        thumbnail_url: packageRow.thumbnail_url,
        original_price: originalPrice,
        package_price: packagePrice,
        courses: includedCourses,
      },
      profile,
      coupon,
      demoEnabled,
      razorpayEnabled,
      razorpayStatus,
      commissionPreview:
        context.userId &&
        demoEnabled &&
        affiliatePromoApplied &&
        packageCommissionDefaults(packageRow).commission_value > 0
          ? {
              type: packageCommissionDefaults(packageRow).commission_type,
              value: packageCommissionDefaults(packageRow).commission_value,
              amount: calculateAffiliateCommission(
                total,
                packageCommissionDefaults(packageRow).commission_type,
                packageCommissionDefaults(packageRow).commission_value,
              ),
            }
          : null,
      total,
      currency: "INR",
    };
  });

export const createRazorpayTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        promoCode: z.string().trim().max(40).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    if (!(roles ?? []).some((row) => row.role === "student" || row.role === "admin")) {
      throw new Error("A student account is required to start package checkout.");
    }

    const { data: profile, error: profileError } = await context.supabase
      .from("users")
      .select("full_name, email, mobile")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const profileValidation = z
      .object({
        full_name: z.string().trim().min(2),
        email: z.string().email(),
        mobile: z
          .string()
          .trim()
          .regex(/^\+?[\d\s()-]+$/)
          .refine((value) => {
            const digits = value.replace(/\D/g, "").length;
            return digits >= 10 && digits <= 15;
          }),
      })
      .safeParse(profile);
    if (!profileValidation.success) {
      throw new Error("Complete your name, email, and valid mobile number before checkout.");
    }

    const { createRazorpayTestOrder: createOrder } = await import("@/lib/razorpay-test.server");
    return createOrder({
      userId: context.userId,
      packageSlug: data.slug,
      promoCode: data.promoCode,
    });
  });

export const verifyRazorpayTestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        paymentId: z.string().min(1).max(100),
        razorpayPaymentId: z.string().min(1).max(100),
        orderId: z.string().min(1).max(100),
        signature: z.string().length(64),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { verifyRazorpayTestPayment: verifyPayment } = await import("@/lib/razorpay-test.server");
    return verifyPayment({ userId: context.userId, ...data });
  });

export const cancelRazorpayTestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { cancelRazorpayTestPayment: cancelPayment } = await import("@/lib/razorpay-test.server");
    await cancelPayment(context.userId, data.paymentId);
    return { status: "cancelled" as const };
  });

export const recordRazorpayTestFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        paymentId: z.string().min(1).max(100),
        razorpayPaymentId: z.string().min(1).max(100),
        orderId: z.string().min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { recordRazorpayTestFailure: recordFailure } = await import("@/lib/razorpay-test.server");
    await recordFailure({ userId: context.userId, ...data });
    return { status: "failed" as const };
  });

export const getRazorpayTestPaymentReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { getRazorpayTestReceipt } = await import("@/lib/razorpay-test.server");
    return getRazorpayTestReceipt(context.userId, data.paymentId);
  });

export const createDemoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        promoCode: z.string().trim().max(40).nullable(),
        outcome: z.enum(["demo_success", "demo_failed"]),
        requestId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    if (!(roles ?? []).some((row) => row.role === "student" || row.role === "admin")) {
      throw new Error("A student account is required to start package checkout.");
    }

    const { data: profile, error: profileError } = await context.supabase
      .from("users")
      .select("full_name, email, mobile")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const profileValidation = z
      .object({
        full_name: z.string().trim().min(2),
        email: z.string().email(),
        mobile: z
          .string()
          .trim()
          .regex(/^\+?[\d\s()-]+$/)
          .refine((value) => {
            const digits = value.replace(/\D/g, "").length;
            return digits >= 10 && digits <= 15;
          }),
      })
      .safeParse(profile);
    if (!profileValidation.success) {
      throw new Error("Complete your name, email, and valid mobile number before checkout.");
    }

    const { createDemoPackagePayment } = await import("@/lib/demo-payment.server");
    const result = await createDemoPackagePayment({
      userId: context.userId,
      packageSlug: data.slug,
      promoCode: data.promoCode,
      outcome: data.outcome,
      requestId: data.requestId,
    });
    return result;
  });

export const getDemoPaymentReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { getMyDemoPayment } = await import("@/lib/demo-payment.server");
    return getMyDemoPayment(context.userId, data.paymentId);
  });
