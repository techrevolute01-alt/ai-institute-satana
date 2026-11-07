export type AffiliateCommissionType = "percentage" | "fixed";

export type OrderItemPaymentAllocation = {
  itemId: string;
  paymentAmount: number;
  eligibleForCommission: boolean;
};

export type RefundWalletAdjustment = {
  commissionAmount: number;
  pendingDebit: number;
  availableDebit: number;
  recoveryIncrease: number;
};

function roundCurrency(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateAffiliateCommission(
  paymentAmount: number,
  commissionType: AffiliateCommissionType,
  commissionValue: number,
) {
  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount < 0 ||
    !Number.isFinite(commissionValue) ||
    commissionValue < 0 ||
    (commissionType === "percentage" && commissionValue > 100)
  ) {
    throw new Error("The affiliate commission settings are invalid.");
  }

  const amount =
    commissionType === "percentage"
      ? (paymentAmount * commissionValue) / 100
      : Math.min(paymentAmount, commissionValue);
  return roundCurrency(amount);
}

export function allocatePaymentAcrossOrderItems(
  paymentAmount: number,
  items: Array<{ id: string; amount: number; eligibleForCommission: boolean }>,
): OrderItemPaymentAllocation[] {
  const itemTotal = items.reduce((total, item) => total + item.amount, 0);
  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount < 0 ||
    items.length === 0 ||
    items.some((item) => !Number.isFinite(item.amount) || item.amount < 0) ||
    itemTotal <= 0
  ) {
    throw new Error("The order item payment allocation is invalid.");
  }

  let allocated = 0;
  return items.map((item, index) => {
    const itemPayment =
      index === items.length - 1
        ? roundCurrency(paymentAmount - allocated)
        : roundCurrency((paymentAmount * item.amount) / itemTotal);
    allocated = roundCurrency(allocated + itemPayment);
    return {
      itemId: item.id,
      paymentAmount: itemPayment,
      eligibleForCommission: item.eligibleForCommission,
    };
  });
}

export function adjustAffiliateCommissionForRefund(
  commissionAmount: number,
  paymentAmount: number,
  refundAmount: number,
) {
  if (
    !Number.isFinite(commissionAmount) ||
    commissionAmount < 0 ||
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0 ||
    !Number.isFinite(refundAmount) ||
    refundAmount < 0
  ) {
    throw new Error("The refund amounts are invalid.");
  }

  const retainedPayment = Math.max(0, paymentAmount - refundAmount);
  return roundCurrency((commissionAmount * retainedPayment) / paymentAmount);
}

export function calculateRefundWalletAdjustment(input: {
  grossCommission: number;
  paymentAmount: number;
  cumulativeRefundAmount: number;
  paidAmount: number;
  recoveredAmount: number;
  recoveryDue: number;
  status: "pending" | "approved" | "paid" | "recovered" | "reversed";
  pendingBalance: number;
  availableBalance: number;
}): RefundWalletAdjustment {
  const values = [
    input.grossCommission,
    input.paymentAmount,
    input.cumulativeRefundAmount,
    input.paidAmount,
    input.recoveredAmount,
    input.recoveryDue,
    input.pendingBalance,
    input.availableBalance,
  ];
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    input.paymentAmount <= 0 ||
    input.cumulativeRefundAmount > input.paymentAmount
  ) {
    throw new Error("The refund amounts are invalid.");
  }

  const commissionAmount = roundCurrency(
    (input.grossCommission * (input.paymentAmount - input.cumulativeRefundAmount)) /
      input.paymentAmount,
  );
  const oldUnpaid = Math.max(
    0,
    input.grossCommission - input.paidAmount - input.recoveredAmount - input.recoveryDue,
  );
  const newUnpaid = Math.max(
    0,
    commissionAmount - input.paidAmount - input.recoveredAmount - input.recoveryDue,
  );
  const revokeUnpaid = roundCurrency(Math.max(0, oldUnpaid - newUnpaid));
  const settledDue = roundCurrency(
    Math.max(0, input.paidAmount + input.recoveredAmount - commissionAmount - input.recoveryDue),
  );

  if (input.status === "pending") {
    if (input.pendingBalance < revokeUnpaid) {
      throw new Error("Pending commission balance is inconsistent; refund was not applied.");
    }
    return {
      commissionAmount,
      pendingDebit: revokeUnpaid,
      availableDebit: 0,
      recoveryIncrease: settledDue,
    };
  }

  const availableDebit = roundCurrency(Math.min(input.availableBalance, revokeUnpaid + settledDue));
  return {
    commissionAmount,
    pendingDebit: 0,
    availableDebit,
    recoveryIncrease: roundCurrency(revokeUnpaid + settledDue - availableDebit),
  };
}

export function isVerifiedLiveCommissionPayment(input: {
  status: string;
  paymentMode: string | null;
  provider: string | null;
  providerReference: string | null;
  amount: number;
  orderTotal: number;
}) {
  return (
    input.status === "paid" &&
    input.paymentMode === "live" &&
    input.provider?.toLowerCase() !== "demo" &&
    Boolean(input.providerReference) &&
    Number.isFinite(input.amount) &&
    input.amount > 0 &&
    input.amount === input.orderTotal
  );
}
