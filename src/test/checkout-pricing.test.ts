import { describe, expect, it } from "vitest";
import {
  calculateCheckoutPrice,
  calculatePromoDiscount,
  calculateRazorpayTestCheckoutPrice,
} from "@/lib/checkout-pricing";

describe("checkout promo pricing", () => {
  it("calculates fixed discounts against the selected package price", () => {
    expect(calculatePromoDiscount(5000, 500, "fixed")).toEqual({
      amount: 500,
      percentage: 10,
      total: 4500,
    });
  });

  it("calculates percentage discounts and caps them at the package price", () => {
    expect(calculatePromoDiscount(5000, 10, "percentage")).toEqual({
      amount: 500,
      percentage: 10,
      total: 4500,
    });
    expect(calculatePromoDiscount(5000, 120, "percentage").total).toBe(0);
  });

  it("uses the original price when no valid promo is applied", () => {
    expect(calculateCheckoutPrice(5000, 3000)).toEqual({
      basePrice: 5000,
      discount: 0,
      total: 5000,
    });
  });

  it("uses the selling price and deducts a valid promo discount", () => {
    expect(calculateCheckoutPrice(5000, 3000, 300)).toEqual({
      basePrice: 3000,
      discount: 300,
      total: 2700,
    });
  });

  it("rejects invalid package price relationships", () => {
    expect(() => calculateCheckoutPrice(3000, 5000)).toThrow("invalid pricing");
    expect(() => calculateCheckoutPrice(-1, 0)).toThrow("invalid pricing");
  });

  it("caps a promo discount at the selling price and prevents negative totals", () => {
    expect(calculateCheckoutPrice(5000, 3000, 4000)).toEqual({
      basePrice: 3000,
      discount: 3000,
      total: 0,
    });
  });

  it("charges the original price without a Razorpay TEST promo", () => {
    expect(calculateRazorpayTestCheckoutPrice(5000, 3000, false)).toBe(5000);
  });

  it("charges the selling price exactly with a valid Razorpay TEST promo", () => {
    expect(calculateRazorpayTestCheckoutPrice(5000, 3000, true)).toBe(3000);
  });
});
