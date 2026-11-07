import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatRazorpayRpcError,
  getRazorpayTestModeStatus,
  isRazorpayTestModeConfigured,
  verifyRazorpaySignature,
} from "@/lib/razorpay-test.server";
import { razorpayConfigurationMessage } from "@/lib/razorpay-test-config";

const razorpayServerSource = readFileSync(
  resolve(process.cwd(), "src/lib/razorpay-test.server.ts"),
  "utf8",
);
const razorpayMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261107120000_razorpay_test_checkout.sql"),
  "utf8",
);

describe("Razorpay TEST MODE configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a TEST key ID and server-side secret", () => {
    vi.stubEnv("VITE_RAZORPAY_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test-secret");
    expect(isRazorpayTestModeConfigured()).toBe(true);
    expect(getRazorpayTestModeStatus()).toBe("ready");

    vi.stubEnv("VITE_RAZORPAY_KEY_ID", "rzp_live_example");
    expect(isRazorpayTestModeConfigured()).toBe(false);
    expect(getRazorpayTestModeStatus()).toBe("invalid_key_id");

    vi.stubEnv("VITE_RAZORPAY_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(isRazorpayTestModeConfigured()).toBe(false);
    expect(getRazorpayTestModeStatus()).toBe("missing_secret");

    vi.stubEnv("VITE_RAZORPAY_KEY_ID", "");
    expect(getRazorpayTestModeStatus()).toBe("missing_key_id");
  });

  it("explains missing configuration without exposing secret values", () => {
    expect(razorpayConfigurationMessage("missing_secret")).toContain("RAZORPAY_KEY_SECRET");
    expect(razorpayConfigurationMessage("missing_secret")).not.toContain("test-secret");
  });
});

describe("Razorpay payment signature verification", () => {
  it("accepts only the HMAC for the supplied order and payment IDs", () => {
    const secret = "local-test-secret";
    const orderId = "order_test_123";
    const paymentId = "pay_test_456";
    const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

    expect(verifyRazorpaySignature(orderId, paymentId, signature, secret)).toBe(true);
    expect(verifyRazorpaySignature(orderId, paymentId, "0".repeat(64), secret)).toBe(false);
    expect(verifyRazorpaySignature("another-order", paymentId, signature, secret)).toBe(false);
    expect(verifyRazorpaySignature(orderId, paymentId, "invalid", secret)).toBe(false);
  });
});

describe("Razorpay database prerequisite errors", () => {
  it("reports the RPC name, database code, and actual prerequisite error", () => {
    expect(
      formatRazorpayRpcError("create_razorpay_test_order", {
        code: "PGRST202",
        message: "Could not find the function in the schema cache.",
      }),
    ).toBe(
      "Razorpay TEST checkout could not call create_razorpay_test_order (database error PGRST202): Could not find the function in the schema cache.",
    );
  });

  it("uses SQL RPC argument names for all Razorpay TEST checkout functions", () => {
    expect(razorpayServerSource).toMatch(
      /"create_razorpay_test_order",\s*\{\s*_user_id:\s*input\.userId,\s*_package_slug:\s*input\.packageSlug,\s*_promo_code:\s*input\.promoCode,/,
    );
    expect(razorpayServerSource).toMatch(
      /"cancel_razorpay_test_order",\s*\{\s*_payment_id:\s*paymentId,\s*_user_id:\s*userId,\s*_payment_status:\s*"cancelled",/,
    );
    expect(razorpayServerSource).toMatch(
      /"complete_razorpay_test_payment",\s*\{\s*_payment_id:\s*input\.paymentId,\s*_user_id:\s*input\.userId,\s*_razorpay_order_id:\s*input\.orderId,\s*_razorpay_payment_id:\s*input\.razorpayPaymentId,/,
    );
    expect(razorpayMigration).toMatch(
      /CREATE FUNCTION public\.create_razorpay_test_order\(\s*_user_id uuid,\s*_package_slug text,\s*_promo_code text/s,
    );
    expect(razorpayMigration).toMatch(
      /CREATE FUNCTION public\.complete_razorpay_test_payment\(\s*_payment_id uuid,\s*_user_id uuid,\s*_razorpay_order_id text,\s*_razorpay_payment_id text/s,
    );
    expect(razorpayMigration).toMatch(
      /CREATE FUNCTION public\.cancel_razorpay_test_order\(\s*_payment_id uuid,\s*_user_id uuid,\s*_payment_status text/s,
    );
    expect(razorpayMigration).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });
});
