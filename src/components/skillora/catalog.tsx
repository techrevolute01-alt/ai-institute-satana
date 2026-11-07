import { Link } from "@tanstack/react-router";
import { Check, Clock3, Gauge, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import design from "@/assets/course-design.jpg";
import data from "@/assets/course-data.jpg";
import product from "@/assets/course-product.jpg";

export const packages = [
  {
    name: "Design Systems Pro",
    slug: "design-systems-pro",
    desc: "Build scalable, token-driven design systems from zero to production.",
    old: "$260",
    price: "$180",
    discount: "30%",
    count: 12,
    features: ["Project-based lessons", "Quizzes and certificates", "Lifetime access"],
  },
  {
    name: "Analytics & Data",
    slug: "analytics-data",
    desc: "Turn raw data into decisions with SQL, dashboards, and clear stories.",
    old: "$175",
    price: "$140",
    discount: "20%",
    count: 9,
    features: ["Guided exercises", "Portfolio projects", "Downloadable resources"],
  },
  {
    name: "Product Management",
    slug: "product-management",
    desc: "Discovery, roadmaps, and stakeholder craft for confident product builders.",
    old: "$280",
    price: "$210",
    discount: "25%",
    count: 14,
    features: ["Practical templates", "Capstone project", "Certificates"],
  },
];
export const courses = [
  {
    title: "UI Design Fundamentals",
    slug: "ui-design-fundamentals",
    instructor: "Mara Okafor",
    duration: "8 weeks",
    level: "Intermediate",
    category: "Design",
    image: design,
  },
  {
    title: "Data Storytelling",
    slug: "data-storytelling",
    instructor: "Dev Anand",
    duration: "6 weeks",
    level: "Beginner",
    category: "Data",
    image: data,
  },
  {
    title: "Product Writing",
    slug: "product-writing",
    instructor: "Lena Voss",
    duration: "10 weeks",
    level: "Advanced",
    category: "Product",
    image: product,
  },
];
export function PackageCard({ item }: { item: { name: string; slug: string; desc: string; image?: string | null; old: string; price: string; discount: string; count: number; features: string[] } }) {
  return (
    <article className="lift flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      {item.image && (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          width={1024}
          height={640}
          className="aspect-[16/9] w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-5">
      <div className="flex justify-between text-xs font-semibold uppercase text-muted-foreground">
        <span>{item.count} courses</span>
        <span className="rounded bg-secondary px-2 py-1 text-primary">-{item.discount}</span>
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">{item.name}</h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.desc}</p>
      <div className="mt-5 flex items-end gap-2">
        <strong className="font-display text-3xl">{item.price}</strong>
        <span className="text-sm text-muted-foreground line-through">{item.old}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {item.features.map((x) => (
          <li key={x} className="flex gap-2">
            <Check className="size-4 text-success" />
            {x}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-6">
        <Link to="/packages/$slug" params={{ slug: item.slug }}>
          View Package
        </Link>
      </Button>
      </div>
    </article>
  );
}
export function CourseCard({ item }: { item: { title: string; slug: string; instructor: string; duration: string; level: string; category: string; image: string | null } }) {
  return (
    <article className="lift overflow-hidden rounded-lg border border-line bg-surface">
      <img
        src={item.image || design}
        alt=""
        loading="lazy"
        width={1024}
        height={640}
        className="aspect-[16/10] w-full object-cover"
      />
      <div className="p-5">
        <p className="text-xs font-semibold uppercase text-accent">{item.category}</p>
        <h3 className="mt-2 font-display text-xl font-semibold">{item.title}</h3>
        <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <UserRound className="size-4" />
            {item.instructor}
          </span>
          <div className="flex gap-4">
            <span className="flex items-center gap-2">
              <Clock3 className="size-4" />
              {item.duration}
            </span>
            <span className="flex items-center gap-2">
              <Gauge className="size-4" />
              {item.level}
            </span>
          </div>
        </div>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link to="/courses/$slug" params={{ slug: item.slug }}>
            View course
          </Link>
        </Button>
      </div>
    </article>
  );
}
