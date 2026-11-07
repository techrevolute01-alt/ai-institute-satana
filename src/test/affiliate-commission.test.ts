import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  allocatePaymentAcrossOrderItems,
  adjustAffiliateCommissionForRefund,
  calculateAffiliateCommission,
  calculateRefundWalletAdjustment,
  isVerifiedLiveCommissionPayment,
} from "@/lib/affiliate-commission";
import { calculateCheckoutPrice } from "@/lib/checkout-pricing";

const commissionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104190000_affiliate_commission_settings.sql"),
  "utf8",
);
const checkoutFunctionRepair = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261104190001_repair_missing_checkout_functions.sql"),
  "utf8",
);

describe("affiliate commission calculations", () => {
  it("calculates a percentage from the final amount paid", () => {
    expect(calculateAffiliateCommission(2700, "percentage", 10)).toBe(270);
  });

  it("calculates a fixed commission", () => {
    expect(calculateAffiliateCommission(2700, "fixed", 300)).toBe(300);
  });

  it("caps a fixed commission to the eligible amount paid", () => {
    expect(calculateAffiliateCommission(120, "fixed", 300)).toBe(120);
  });

  it("allocates a payment across all order items without including ineligible items in commission eligibility", () => {
    expect(
      allocatePaymentAcrossOrderItems(1000, [
        { id: "package-a", amount: 600, eligibleForCommission: true },
        { id: "course", amount: 300, eligibleForCommission: false },
        { id: "package-b", amount: 100, eligibleForCommission: true },
      ]),
    ).toEqual([
      { itemId: "package-a", paymentAmount: 600, eligibleForCommission: true },
      { itemId: "course", paymentAmount: 300, eligibleForCommission: false },
      { itemId: "package-b", paymentAmount: 100, eligibleForCommission: true },
    ]);
  });

  it("prorates commission for partial refunds and reverses full refunds", () => {
    expect(adjustAffiliateCommissionForRefund(270, 2700, 900)).toBe(180);
    expect(adjustAffiliateCommissionForRefund(300, 2700, 2700)).toBe(0);
  });

  it("debits pending commission for partial and full refunds", () => {
    expect(
      calculateRefundWalletAdjustment({
        grossCommission: 300,
        paymentAmount: 3000,
        cumulativeRefundAmount: 1000,
        paidAmount: 0,
        recoveredAmount: 0,
        recoveryDue: 0,
        status: "pending",
        pendingBalance: 300,
        availableBalance: 0,
      }),
    ).toEqual({
      commissionAmount: 200,
      pendingDebit: 100,
      availableDebit: 0,
      recoveryIncrease: 0,
    });

    expect(
      calculateRefundWalletAdjustment({
        grossCommission: 300,
        paymentAmount: 3000,
        cumulativeRefundAmount: 3000,
        paidAmount: 0,
        recoveredAmount: 0,
        recoveryDue: 0,
        status: "pending",
        pendingBalance: 300,
        availableBalance: 0,
      }),
    ).toEqual({
      commissionAmount: 0,
      pendingDebit: 300,
      availableDebit: 0,
      recoveryIncrease: 0,
    });
  });

  it("records post-payout refund debt without allowing a negative wallet balance", () => {
    expect(
      calculateRefundWalletAdjustment({
        grossCommission: 300,
        paymentAmount: 3000,
        cumulativeRefundAmount: 3000,
        paidAmount: 300,
        recoveredAmount: 0,
        recoveryDue: 0,
        status: "paid",
        pendingBalance: 0,
        availableBalance: 75,
      }),
    ).toEqual({
      commissionAmount: 0,
      pendingDebit: 0,
      availableDebit: 75,
      recoveryIncrease: 225,
    });
  });

  it("does not create commissions for demo or mismatched payments", () => {
    const verifiedPayment = {
      status: "paid",
      paymentMode: "live",
      provider: "gateway",
      providerReference: "payment-1",
      amount: 2700,
      orderTotal: 2700,
    };
    expect(isVerifiedLiveCommissionPayment(verifiedPayment)).toBe(true);
    expect(isVerifiedLiveCommissionPayment({ ...verifiedPayment, paymentMode: "demo" })).toBe(
      false,
    );
    expect(isVerifiedLiveCommissionPayment({ ...verifiedPayment, provider: "demo" })).toBe(false);
    expect(isVerifiedLiveCommissionPayment({ ...verifiedPayment, amount: 2400 })).toBe(false);
  });

  it("asserts payment, refund, and payout idempotency guards in SQL", () => {
    expect(commissionMigration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_order_item_unique[\s\S]*?ON public\.affiliate_commissions \(order_item_id\)/,
    );
    expect(commissionMigration).toMatch(
      /ON CONFLICT \(order_item_id\) WHERE order_item_id IS NOT NULL DO NOTHING/,
    );
    expect(commissionMigration).toMatch(
      /NEW\.payment_mode IS DISTINCT FROM 'live'[\s\S]*?Demo or unverified payments cannot earn commissions/,
    );
    expect(commissionMigration).toMatch(/Demo payments cannot be marked paid/);
    expect(commissionMigration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS refunds_payment_provider_reference_unique/,
    );
    expect(commissionMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.process_affiliate_payout[\s\S]*?FOR UPDATE/,
    );
  });

  it("repairs checkout functions without allowing TEST access or commissions", () => {
    expect(checkoutFunctionRepair).toMatch(
      /CREATE OR REPLACE FUNCTION private\.guard_verified_payment\(\)[\s\S]*?NEW\.payment_mode = 'test'[\s\S]*?razorpay/i,
    );
    expect(checkoutFunctionRepair).toMatch(
      /CREATE OR REPLACE FUNCTION private\.guard_paid_order_access\(\)[\s\S]*?p\.payment_mode = 'live'[\s\S]*?p\.payment_mode = 'test'[\s\S]*?razorpay/i,
    );
    expect(checkoutFunctionRepair).toMatch(
      /CREATE OR REPLACE FUNCTION private\.record_affiliate_commission_for_payment\(\)[\s\S]*?NEW\.payment_mode IS DISTINCT FROM 'live'[\s\S]*?Demo or unverified payments cannot earn commissions/,
    );
    expect(checkoutFunctionRepair).toMatch(
      /WHEN \(NEW\.payment_mode IS DISTINCT FROM 'test'\)[\s\S]*?EXECUTE FUNCTION private\.record_affiliate_commission_for_payment\(\)/,
    );
    expect(checkoutFunctionRepair).toMatch(/SECURITY DEFINER/);
    expect(checkoutFunctionRepair).toMatch(/SET search_path = public, private, pg_temp/);
  });

  it("rejects invalid commission settings", () => {
    expect(() => calculateAffiliateCommission(2700, "percentage", 101)).toThrow(
      "The affiliate commission settings are invalid.",
    );
    expect(() => calculateAffiliateCommission(-1, "fixed", 300)).toThrow(
      "The affiliate commission settings are invalid.",
    );
  });

  it("preserves package pricing without a promo and with a valid promo discount", () => {
    expect(calculateCheckoutPrice(3000, 2700).total).toBe(3000);
    expect(calculateCheckoutPrice(3000, 2700, 300).total).toBe(2400);
  });
});
