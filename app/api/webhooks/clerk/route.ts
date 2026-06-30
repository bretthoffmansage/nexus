import { ConvexHttpClient } from "convex/browser";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getClerkWebhookSecret, getConvexUrl, getInternalApiSecret } from "@/lib/env";

export const dynamic = "force-dynamic";

function primaryEmailFromUser(data: {
  email_addresses?: Array<{ id?: string; email_address?: string }>;
  primary_email_address_id?: string | null;
}): string | undefined {
  const emails = data.email_addresses;
  const primaryId = data.primary_email_address_id;
  if (!emails?.length) return undefined;
  const primary = emails.find((entry) => entry.id === primaryId);
  return (primary?.email_address ?? emails[0]?.email_address)?.toLowerCase();
}

function displayNameFromUser(data: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}): string | undefined {
  const first = data.first_name ?? undefined;
  const last = data.last_name ?? undefined;
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || data.username || undefined;
}

function clerkUserIdFromEvent(
  eventType: string,
  data: { id?: string },
): string | undefined {
  if (eventType === "user.created" || eventType === "user.updated" || eventType === "user.deleted") {
    return data.id;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const webhookSecret = getClerkWebhookSecret();
  const convexUrl = getConvexUrl();
  const internalSecret = getInternalApiSecret();

  if (!webhookSecret || !convexUrl || !internalSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const eventId = request.headers.get("svix-id")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "Missing webhook id" }, { status: 400 });
  }

  let event;
  try {
    event = await verifyWebhook(request, { signingSecret: webhookSecret });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const clerkUserId = clerkUserIdFromEvent(event.type, event.data);
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unsupported webhook event" }, { status: 400 });
  }

  const client = new ConvexHttpClient(convexUrl);
  await client.mutation(api.webhookIngest.processClerkWebhook, {
    internalSecret,
    eventId,
    eventType: event.type,
    clerkUserId,
    primaryEmail:
      event.type === "user.created" || event.type === "user.updated"
        ? primaryEmailFromUser(event.data)
        : undefined,
    displayName:
      event.type === "user.created" || event.type === "user.updated"
        ? displayNameFromUser(event.data)
        : undefined,
  });

  return NextResponse.json({ ok: true });
}
