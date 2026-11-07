import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Brand } from "./layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-2">
      <section className="hidden border-r border-line bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div>
          <p className="text-sm uppercase text-primary-foreground/80">Learn. Grow. Earn.</p>
          <p className="mt-4 max-w-md font-display text-5xl font-bold">
            Your next skill starts with one clear step.
          </p>
        </div>
        <p className="text-sm text-paper/60">AI Institute Satana</p>
      </section>
      <section className="grid place-items-center px-5 py-12">
        <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"}`}>{children}</div>
      </section>
    </main>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}) {
  const inner = (
    <>
      <div className="lg:hidden">
        <Brand />
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </>
  );
  const cls = "grid gap-5 rounded-lg bg-surface p-7 border border-line";
  return onSubmit ? (
    <form onSubmit={onSubmit} noValidate className={cls}>
      {inner}
    </form>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <Input aria-invalid={Boolean(error)} {...props} />
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </label>
  );
}

export function PasswordField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <span className="relative">
        <Input
          className="pr-11"
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </span>
      {error && <span className="text-xs font-medium text-destructive">{error}</span>}
    </label>
  );
}
