import { useQuery } from "@tanstack/react-query";
import { getPublicPackages } from "@/lib/catalog.functions";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PageIntro } from "@/components/skillora/layout";
import { PackageCard } from "@/components/skillora/catalog";
export const Route = createFileRoute("/packages/")({
  head: () => ({
    meta: [
      { title: "Learning Packages — AI Institute" },
      { name: "description", content: "Compare AI Institute learning packages and included courses." },
      { property: "og:title", content: "Learning Packages — AI Institute" },
      {
        property: "og:description",
        content: "Focused course bundles for practical career growth.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const { data } = useQuery({
    queryKey: ["public-packages"],
    queryFn: () => getPublicPackages(),
  });
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Learning packages"
        title="Choose a path with a clear finish line."
        description="Focused bundles bring courses, resources, quizzes, and certificates together."
      />
      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-14 sm:px-8 md:grid-cols-3">
        {(data ?? []).map((p) => (
          <PackageCard key={p.slug} item={p} />
        ))}
      </main>
    </PublicLayout>
  );
}
