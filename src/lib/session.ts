// Anonymous visitors: each browser gets a `moot_visitor` cookie and its own household.
import { cookies } from "next/headers";

export const VISITOR_COOKIE = "moot_visitor";

export async function getVisitorId(): Promise<string | null> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
  return value && /^[a-z0-9]{8,40}$/.test(value) ? value : null;
}

export async function getOrCreateVisitorId(): Promise<string> {
  const existing = await getVisitorId();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  (await cookies()).set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return id;
}

export function householdIdFor(visitorId: string): string {
  return `hh_${visitorId}`;
}

export function originOf(req: Request): string {
  return new URL(req.url).origin;
}

export function errorJson(status: number, error: string) {
  return Response.json({ error }, { status });
}
