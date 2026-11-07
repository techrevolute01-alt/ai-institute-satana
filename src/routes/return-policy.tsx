import { createFileRoute } from "@tanstack/react-router";
import { LegalSection } from "@/components/skillora/legal-page";
import { PageIntro, PublicLayout } from "@/components/skillora/layout";
import { INSTITUTE } from "@/lib/institute-info";

export const Route = createFileRoute("/return-policy")({
  head: () => ({ meta: [{ title: "Return Policy — AI Institute Satana" }] }),
  component: ReturnPolicyPage,
});

function ReturnPolicyPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Policies"
        title="Return Policy"
        description="Information about returns and cancellations for AI Institute Satana's online educational services."
      />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="leading-relaxed text-muted-foreground">
          AI Institute Satana provides digital courses and online educational services. This
          policy explains how return and cancellation terms for those digital services should be
          understood. It does not describe returns of physical products.
        </p>
        <LegalSection title="Digital courses and online services">
          <p>
            Courses, packages, and related learning resources are delivered digitally. There is
            no physical course item to ship back as part of these services.
          </p>
        </LegalSection>
        <LegalSection title="Applicability of returns">
          <p>
            Physical-product return conditions do not apply to digital courses or online
            educational services. Any cancellation or refund request for a digital purchase is
            subject to the applicable confirmed purchase terms and refund policy.
          </p>
        </LegalSection>
        <LegalSection title="Course and package cancellations">
          <p>
            <strong>Editable placeholder:</strong> Cancellation conditions, including any
            applicable timing or effect on access, have not been confirmed. Add the approved
            cancellation terms here before publishing final policy conditions.
          </p>
        </LegalSection>
        <LegalSection title="Customer support">
          <p>
            For help with course access, a purchase, or a cancellation request, contact us at{" "}
            <a className="font-medium text-ink underline" href={`mailto:${INSTITUTE.email}`}>
              {INSTITUTE.email}
            </a>{" "}
            or visit our{" "}
            <a className="font-medium text-ink underline" href="/contact">
              Contact Us page
            </a>
            . Include your order reference where applicable, but do not send full payment-card
            details.
          </p>
        </LegalSection>
      </main>
    </PublicLayout>
  );
}
