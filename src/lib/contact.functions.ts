import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const submissionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,15}$/),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(2000),
});

export type ContactFormInput = z.infer<typeof submissionSchema>;

export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { checkContactRequestLimit } = await import("@/lib/contact-rate-limit.server");
    const rateLimit = await checkContactRequestLimit();
    if (!rateLimit.allowed) {
      return {
        ok: false as const,
        error: `Too many messages were submitted from this connection. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minutes.`,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_submissions").insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      subject: data.subject,
      message: data.message,
    });
    if (error) {
      console.error("[contact] insert failed:", error.message);
      return {
        ok: false as const,
        error:
          "Your message could not be sent right now. Please try again, or reach us by phone or email.",
      };
    }
    return { ok: true as const };
  });
