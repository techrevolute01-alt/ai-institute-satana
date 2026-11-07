import { getRequest } from "@tanstack/react-start/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS = 5;
const MAX_CLIENTS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

type ClientBucket = { timestamps: number[] };

const clientBuckets = new Map<string, ClientBucket>();
let lastCleanup = 0;

function getClientAddress(): string {
  const headers = getRequest().headers;
  // Ignore caller-controlled forwarding headers; Cloudflare supplies this value at the edge.
  const address = headers.get("cf-connecting-ip")?.trim();

  return address && address.length <= 64 ? address : "unavailable";
}

function cleanupBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && clientBuckets.size < MAX_CLIENTS) return;
  lastCleanup = now;

  for (const [client, bucket] of clientBuckets) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (bucket.timestamps.length === 0) clientBuckets.delete(client);
  }
}

export function checkContactSubmissionLimit(
  client: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  cleanupBuckets(now);

  let bucket = clientBuckets.get(client);
  if (!bucket) {
    if (clientBuckets.size >= MAX_CLIENTS) {
      return { allowed: false, retryAfterSeconds: Math.ceil(CLEANUP_INTERVAL_MS / 1000) };
    }
    bucket = { timestamps: [] };
    clientBuckets.set(client, bucket);
  }

  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
  if (bucket.timestamps.length >= MAX_SUBMISSIONS) {
    const oldestTimestamp = bucket.timestamps[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldestTimestamp + WINDOW_MS - now) / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

export async function checkContactRequestLimit():
  Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const address = getClientAddress();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const clientHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return checkContactSubmissionLimit(clientHash);
}
