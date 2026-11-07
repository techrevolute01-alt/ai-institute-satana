import { createFileRoute } from "@tanstack/react-router";
import { LegalSection } from "@/components/skillora/legal-page";
import { PageIntro, PublicLayout } from "@/components/skillora/layout";
import { INSTITUTE } from "@/lib/institute-info";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({ meta: [{ title: "Disclaimer — AI Institute Satana" }] }),
  component: DisclaimerPage,
});

function DisclaimerPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Policies"
        title="Disclaimer"
        description="Important information about courses, learning materials, and third-party links on this website."
      />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <LegalSection title="Educational purpose">
          <p>
            Content and courses provided by {INSTITUTE.name} are intended for general educational
            and informational purposes. They are not a substitute for professional advice where
            such advice is needed.
          </p>
        </LegalSection>
        <LegalSection title="Course material accuracy">
          <p>
            We aim to provide useful and accurate learning materials, but information, tools, and
            practices may change. Course content is provided for learning purposes and may not
            reflect every later development or every individual circumstance.
          </p>
        </LegalSection>
        <LegalSection title="Employment and income">
          <p>
            Taking a course or using learning materials does not guarantee employment, a
            particular career outcome, earnings, or income. Results depend on many factors,
            including individual effort, experience, and circumstances.
          </p>
        </LegalSection>
        <LegalSection title="Third-party links">
          <p>
            This website may link to third-party websites or services for convenience. We do not
            control those destinations and are not responsible for their content, availability, or
            privacy practices. Review their terms and policies before using them.
          </p>
        </LegalSection>
        <LegalSection title="Limitation of liability">
          <p>
            To the extent permitted by applicable law, {INSTITUTE.name} is not liable for losses
            arising from reliance on website or course content, interruptions, or third-party
            services. Nothing in this disclaimer excludes or limits liability where applicable
            law does not allow it to be excluded or limited.
          </p>
        </LegalSection>
      </main>
    </PublicLayout>
  );
}
