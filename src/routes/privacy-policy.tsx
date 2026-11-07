import { createFileRoute } from "@tanstack/react-router";
import { LegalSection } from "@/components/skillora/legal-page";
import { PageIntro, PublicLayout } from "@/components/skillora/layout";
import { INSTITUTE } from "@/lib/institute-info";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({ meta: [{ title: "Privacy Policy — AI Institute Satana" }] }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Policies"
        title="Privacy Policy"
        description="How AI Institute Satana handles information connected with your use of our website and learning services."
      />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="leading-relaxed text-muted-foreground">
          This policy describes the information we may collect when you browse our website,
          register, contact us, or use courses and related services. We will update this page if
          our practices change.
        </p>
        <LegalSection title="Information collection and personal information">
          <p>
            We may receive information you provide directly, such as your name, email address,
            phone number, account details, messages, and learning-related information associated
            with your account.
          </p>
          <p>
            When you visit the website, technical information such as browser and device details
            or basic usage information may also be processed to operate and maintain the service.
          </p>
        </LegalSection>
        <LegalSection title="User registration">
          <p>
            If you create an account, information needed to set up and maintain that account is
            processed to provide sign-in, account, and learning features. Keep your login
            credentials private and contact us if you believe your account has been accessed
            without permission.
          </p>
        </LegalSection>
        <LegalSection title="Course purchases and payments">
          <p>
            If you purchase a course or package, order and transaction information may be used to
            confirm and administer the purchase. Payment details are handled through the payment
            services used for the transaction; we do not request that you send card details through
            the contact form.
          </p>
        </LegalSection>
        <LegalSection title="How information is used">
          <p>
            Information may be used to provide and manage accounts, courses, purchases, and
            support; respond to enquiries; maintain service security; and meet applicable legal
            requirements.
          </p>
        </LegalSection>
        <LegalSection title="Data protection">
          <p>
            We use access controls and other reasonable safeguards intended to protect information.
            No method of online storage or transmission can be guaranteed to be completely secure.
          </p>
        </LegalSection>
        <LegalSection title="Cookies and similar technologies">
          <p>
            Cookies or similar technologies may be used where needed for website operation,
            preferences, or service functionality. You can manage cookies through your browser
            settings; disabling them may affect some features.
          </p>
        </LegalSection>
        <LegalSection title="Third-party services">
          <p>
            The website may rely on third-party services for hosting, authentication, payment
            processing, or other functionality. Those providers process information under their
            own terms and privacy practices.
          </p>
        </LegalSection>
        <LegalSection title="Data retention">
          <p>
            Information is retained for as long as needed to provide the service, maintain
            relevant records, resolve issues, and meet applicable legal obligations. Retention
            periods may vary depending on the type of information and purpose.
          </p>
        </LegalSection>
        <LegalSection title="Your rights">
          <p>
            Depending on applicable law, you may have rights to request access to, correction of,
            or deletion of personal information, or to raise an objection or concern. Contact us
            to make a request; we may need to verify your identity before responding.
          </p>
        </LegalSection>
        <LegalSection title="Contact">
          <p>
            For privacy questions or requests, contact {INSTITUTE.name} at{" "}
            <a className="font-medium text-ink underline" href={`mailto:${INSTITUTE.email}`}>
              {INSTITUTE.email}
            </a>
            .
          </p>
        </LegalSection>
      </main>
    </PublicLayout>
  );
}
