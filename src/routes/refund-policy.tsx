import { createFileRoute } from "@tanstack/react-router";
import { LegalSection } from "@/components/skillora/legal-page";
import { PageIntro, PublicLayout } from "@/components/skillora/layout";
import { INSTITUTE } from "@/lib/institute-info";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({ meta: [{ title: "Refund Policy — AI Institute Satana" }] }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Policies"
        title="Refund Policy"
        description="Information about refund requests for purchases made through AI Institute Satana."
      />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="rounded-lg bg-surface p-4 text-sm leading-relaxed border border-line">
          <strong>Policy terms pending confirmation:</strong> The eligibility rules, approval
          conditions, and processing timelines below are editable placeholders and must be
          confirmed by AI Institute Satana before this policy is treated as final. No refund
          guarantee or deadline is stated here.
        </p>
        <LegalSection title="How to request a refund">
          <p>
            Contact us at{" "}
            <a className="font-medium text-ink underline" href={`mailto:${INSTITUTE.email}`}>
              {INSTITUTE.email}
            </a>{" "}
            with your name, order or transaction reference, purchase details, and the reason for
            your request. Please do not include full payment-card details in your message.
          </p>
          <p>
            <strong>Editable placeholder:</strong> Add the confirmed request channel and any
            required supporting information before publishing final refund terms.
          </p>
        </LegalSection>
        <LegalSection title="Refund eligibility">
          <p>
            <strong>Editable placeholder:</strong> Eligibility conditions for digital course and
            package purchases have not been confirmed. Insert the approved criteria here; do not
            assume that a purchase is eligible or ineligible until those terms are confirmed.
          </p>
        </LegalSection>
        <LegalSection title="Duplicate payments">
          <p>
            If you believe you were charged more than once for the same order, contact us with the
            order reference and relevant transaction references so the payments can be reviewed.
            The outcome depends on verification of the transactions.
          </p>
        </LegalSection>
        <LegalSection title="Failed payments">
          <p>
            If a payment appears to have failed but an amount was debited, contact us with the
            order reference and transaction information. We will review the payment status with
            the relevant payment records or provider.
          </p>
        </LegalSection>
        <LegalSection title="Review and approval">
          <p>
            Refund requests are subject to review and verification. Approval criteria and the
            person or process responsible for approval must be confirmed and added here before
            this policy is finalized.
          </p>
        </LegalSection>
        <LegalSection title="Processing timelines">
          <p>
            <strong>Editable placeholder:</strong> Refund decision and processing timelines are
            not confirmed. Add the approved timelines here. If approved, the time for a credit to
            appear may also depend on the payment provider or financial institution.
          </p>
        </LegalSection>
      </main>
    </PublicLayout>
  );
}
