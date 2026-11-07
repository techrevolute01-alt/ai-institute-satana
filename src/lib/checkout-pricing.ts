export function calculatePromoDiscount(
  packagePrice: number,
  discountValue: number,
  discountType: "fixed" | "percentage",
) {
  const requested =
    discountType === "percentage" ? (packagePrice * discountValue) / 100 : discountValue;
  const discount = Math.round(Math.min(packagePrice, requested) * 100) / 100;
  return {
    amount: discount,
    percentage: packagePrice > 0 ? Math.round((discount / packagePrice) * 10000) / 100 : 0,
    total: Math.max(0, Math.round((packagePrice - discount) * 100) / 100),
  };
}

export function calculateCheckoutPrice(
  originalPrice: number,
  sellingPrice: number,
  promoDiscount?: number,
) {
  if (
    !Number.isFinite(originalPrice) ||
    !Number.isFinite(sellingPrice) ||
    originalPrice < 0 ||
    sellingPrice < 0 ||
    sellingPrice > originalPrice
  ) {
    throw new Error("The package has invalid pricing.");
  }
  if (promoDiscount !== undefined && (!Number.isFinite(promoDiscount) || promoDiscount < 0)) {
    throw new Error("The promo code has an invalid discount.");
  }

  const basePrice = promoDiscount === undefined ? originalPrice : sellingPrice;
  const discount = Math.round(Math.min(basePrice, promoDiscount ?? 0) * 100) / 100;
  return {
    basePrice,
    discount,
    total: Math.max(0, Math.round((basePrice - discount) * 100) / 100),
  };
}

export function calculateRazorpayTestCheckoutPrice(
  originalPrice: number,
  sellingPrice: number,
  hasValidPromo: boolean,
) {
  calculateCheckoutPrice(originalPrice, sellingPrice);
  return hasValidPromo ? sellingPrice : originalPrice;
}
