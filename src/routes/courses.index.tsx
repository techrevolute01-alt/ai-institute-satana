import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { PublicLayout, PageIntro } from "@/components/skillora/layout";
import { CourseCard } from "@/components/skillora/catalog";
import { Input } from "@/components/ui/input";
import { getPublicCatalog } from "@/lib/catalog.functions";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Courses — AI Institute" },
      {
        name: "description",
        content: "Browse practical AI Institute courses by category and level.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { data } = useQuery({ queryKey: ["public-catalog"], queryFn: () => getPublicCatalog() });
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Course marketplace"
        title="Practical courses for meaningful progress."
        description="Search by topic, compare levels, and preview the learning path before enrolling."
      />
      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 size-4" />
            <Input
              className="h-10 border border-line bg-surface pl-10"
              placeholder="Search courses"
            />
          </div>
          <select className="h-10 rounded-md border border-line bg-surface px-4 text-sm">
            <option>All categories</option>
            <option>Design</option>
            <option>Data</option>
            <option>Product</option>
          </select>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(data?.courses ?? []).map((course) => (
            <CourseCard key={course.slug} item={course} />
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
