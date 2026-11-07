import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublicLayout, PageIntro } from "@/components/skillora/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitContact } from "@/lib/contact.functions";
import { INSTITUTE, telHref } from "@/lib/institute-info";
import { Phone, Mail, MapPin, ExternalLink, Send } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — AI Institute Satana" },
      {
        name: "description",
        content:
          "Contact AI Institute Satana — call us, email us, visit us in Satana, Nashik, or send us a message through our contact form.",
      },
      { property: "og:title", content: "Contact Us — AI Institute Satana" },
      {
        property: "og:description",
        content:
          "Call, email, or send a message — we're happy to help with courses, packages, and your account.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://ai-institute-data-hub.lovable.app/contact" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Contact Us — AI Institute Satana" },
      {
        name: "twitter:description",
        content:
          "Call, email, or send a message — we're happy to help with courses, packages, and your account.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://ai-institute-data-hub.lovable.app/contact" },
    ],
  }),
  component: ContactPage,
});

type Values = { name: string; email: string; phone: string; subject: string; message: string };
const empty: Values = { name: "", email: "", phone: "", subject: "", message: "" };

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (!v.name.trim()) e.name = "Please enter your name.";
  else if (v.name.trim().length > 100) e.name = "Name must be under 100 characters.";
  if (!v.email.trim()) e.email = "Please enter your email address.";
  else if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Please enter a valid email address.";
  if (!v.phone.trim()) e.phone = "Please enter your phone number.";
  else if (!/^[0-9+\-\s()]{7,15}$/.test(v.phone.trim()))
    e.phone = "Please enter a valid phone number.";
  if (!v.subject.trim()) e.subject = "Please enter a subject.";
  else if (v.subject.trim().length > 150) e.subject = "Subject must be under 150 characters.";
  if (!v.message.trim()) e.message = "Please enter your message.";
  else if (v.message.trim().length > 2000) e.message = "Message must be under 2000 characters.";
  return e;
}

const infoCards = [
  {
    icon: Phone,
    title: "Call us",
    lines: INSTITUTE.phones.map((p) => ({ label: p, href: telHref(p) })),
  },
  {
    icon: Mail,
    title: "Email us",
    lines: [{ label: INSTITUTE.email, href: `mailto:${INSTITUTE.email}` }],
  },
  {
    icon: MapPin,
    title: "Visit us",
    lines: [{ label: INSTITUTE.address, href: INSTITUTE.mapsUrl }],
  },
];

function ContactPage() {
  const [values, setValues] = useState<Values>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState("");

  function set<K extends keyof Values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStatus("sending");
    try {
      const res = await submitContact({ data: values });
      if (res.ok) {
        setStatus("sent");
        setValues(empty);
      } else {
        setStatus("error");
        setServerError(res.error);
      }
    } catch {
      setStatus("error");
      setServerError(
        "Your message could not be sent right now. Please try again, or reach us by phone or email.",
      );
    }
  }

  return (
    <PublicLayout>
      <PageIntro
        eyebrow="Contact Us"
        title="How can we help?"
        description="Reach us by phone, email, or the form below — we're happy to help with courses, packages, and your account."
      />
      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          {infoCards.map(({ icon: Icon, title, lines }) => (
            <article key={title} className="rounded-lg bg-surface p-6 border border-line">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-[3px] bg-accent text-paper border border-line">
                  <Icon className="size-4" />
                </span>
                <h2 className="font-display text-lg font-bold">{title}</h2>
              </div>
              <ul className="mt-4 grid gap-2 text-sm">
                {lines.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="inline-flex items-center gap-1 font-medium hover:text-accent"
                      {...(l.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {l.label}
                      {l.href.startsWith("http") && <ExternalLink className="size-3.5" />}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <section className="mx-auto mt-12 max-w-2xl">
          <h2 className="font-display text-2xl font-bold">Send us a message</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Fill in the form and we'll get back to you as soon as we can.
          </p>

          {status === "sent" && (
            <div
              role="status"
              className="mt-6 rounded-lg bg-surface p-4 text-sm font-medium border border-line"
            >
              Thank you! Your message has been received. We'll get back to you soon.
            </div>
          )}
          {status === "error" && (
            <div
              role="alert"
              className="mt-6 rounded-lg bg-surface p-4 text-sm font-medium text-red-600 border border-line"
            >
              {serverError}
            </div>
          )}

          {status !== "sent" && (
            <form
              onSubmit={onSubmit}
              noValidate
              className="mt-6 grid gap-5 rounded-lg bg-surface p-6 border border-line"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Name
                  <Input
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Your full name"
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <span className="text-xs font-normal text-red-600">{errors.name}</span>}
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Email
                  <Input
                    type="email"
                    value={values.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && (
                    <span className="text-xs font-normal text-red-600">{errors.email}</span>
                  )}
                </label>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">
                  Phone Number
                  <Input
                    type="tel"
                    value={values.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="Your phone number"
                    aria-invalid={Boolean(errors.phone)}
                  />
                  {errors.phone && (
                    <span className="text-xs font-normal text-red-600">{errors.phone}</span>
                  )}
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Subject
                  <Input
                    value={values.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="What is this about?"
                    aria-invalid={Boolean(errors.subject)}
                  />
                  {errors.subject && (
                    <span className="text-xs font-normal text-red-600">{errors.subject}</span>
                  )}
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold">
                Message
                <Textarea
                  rows={6}
                  value={values.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Tell us how we can help"
                  aria-invalid={Boolean(errors.message)}
                />
                {errors.message && (
                  <span className="text-xs font-normal text-red-600">{errors.message}</span>
                )}
              </label>
              <Button type="submit" variant="accent" disabled={status === "sending"}>
                <Send className="size-4" />
                {status === "sending" ? "Sending…" : "Send message"}
              </Button>
            </form>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
