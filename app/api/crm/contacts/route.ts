import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import type { Prisma, ContactChannel } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

const PAGE_SIZE = 50;

const CONTACT_CHANNELS: ContactChannel[] = [
  "INSTAGRAM",
  "WHATSAPP",
  "FACEBOOK",
  "TIKTOK",
  "EMAIL",
];

function isContactChannel(value: string | null): value is ContactChannel {
  return value !== null && (CONTACT_CHANNELS as string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const channel = params.get("channel");
  const tagId = params.get("tagId");
  const assignedUserId = params.get("assignedUserId");
  const offset = Math.max(Number.parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  const where: Prisma.ContactWhereInput = {
    workspaceId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { instagramUsername: { contains: q, mode: "insensitive" } },
            { whatsappPhone: { contains: q, mode: "insensitive" } },
            { tiktokHandle: { contains: q, mode: "insensitive" } },
            { orderLink: { contains: q, mode: "insensitive" } },
            { tiendaNubeOrderNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(isContactChannel(channel) ? { originChannel: channel } : {}),
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(tagId ? { tags: { some: { tagId } } } : {}),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: offset,
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      contacts: contacts.map(serializeContact),
      total,
      offset,
      pageSize: PAGE_SIZE,
    },
  });
}

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const data = pickContactFields(body);

  const contact = await prisma.contact.create({
    data: { ...data, workspaceId },
    include: {
      assignedUser: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json({ success: true, data: serializeContact(contact) });
}

export function pickContactFields(
  body: Record<string, unknown>
): Omit<Prisma.ContactUncheckedCreateInput, "workspaceId"> {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const num = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : undefined;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined);

  return {
    name: str(body.name) ?? null,
    instagramUsername: str(body.instagramUsername) ?? null,
    instagramUserId: str(body.instagramUserId) ?? null,
    whatsappPhone: str(body.whatsappPhone) ?? null,
    facebookPsid: str(body.facebookPsid) ?? null,
    tiktokHandle: str(body.tiktokHandle) ?? null,
    email: str(body.email) ?? null,
    originChannel: isContactChannel((body.originChannel as string) ?? null)
      ? (body.originChannel as ContactChannel)
      : null,
    budget: num(body.budget) ?? null,
    orderLink: str(body.orderLink) ?? null,
    brandInterest: str(body.brandInterest) ?? null,
    shoeSizeUs: num(body.shoeSizeUs) ?? null,
    shoeSizeCm: num(body.shoeSizeCm) ?? null,
    tiendaNubeOrderNumber: str(body.tiendaNubeOrderNumber) ?? null,
    productsInterest: arr(body.productsInterest) ?? [],
    assignedUserId: str(body.assignedUserId) ?? null,
  };
}

export function serializeContact<
  T extends {
    budget: unknown;
    shoeSizeUs: unknown;
    shoeSizeCm: unknown;
  },
>(contact: T) {
  return {
    ...contact,
    budget: contact.budget === null ? null : Number(contact.budget),
    shoeSizeUs: contact.shoeSizeUs === null ? null : Number(contact.shoeSizeUs),
    shoeSizeCm: contact.shoeSizeCm === null ? null : Number(contact.shoeSizeCm),
  };
}
