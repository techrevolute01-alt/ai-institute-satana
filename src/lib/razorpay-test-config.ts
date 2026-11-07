export type RazorpayTestModeStatus =
  "ready" | "missing_key_id" | "invalid_key_id" | "missing_secret";

export function razorpayConfigurationMessage(status: RazorpayTestModeStatus) {
  switch (status) {
    case "missing_key_id":
      return "Razorpay TEST checkout is not configured: set VITE_RAZORPAY_KEY_ID to your rzp_test_ key ID.";
    case "invalid_key_id":
      return "Razorpay TEST checkout requires a key ID beginning with rzp_test_. Live payments are disabled.";
    case "missing_secret":
      return "Razorpay TEST checkout is not configured: set RAZORPAY_KEY_SECRET as a server-side environment variable.";
    case "ready":
      return "Razorpay TEST checkout is configured.";
  }
}
