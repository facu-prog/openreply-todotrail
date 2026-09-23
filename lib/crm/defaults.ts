import { prisma } from "@/lib/db/client";

export const VENTAS_KEY = "ventas";
export const POSTVENTA_KEY = "postventa";

const VENTAS_STAGES = [
  { name: "Incoming leads", order: 0 },
  { name: "In progress", order: 1 },
  { name: "Won", order: 2, isWon: true },
  { name: "Lost", order: 3, isLost: true },
];

const POSTVENTA_STAGES = [
  { name: "Open", order: 0 },
  { name: "In progress", order: 1 },
  { name: "Resolved", order: 2 },
];

const DEFAULT_COMPLAINT_TYPES = [
  "Talle incorrecto",
  "Producto dañado",
  "Demora en envío",
  "Cambio/Devolución",
  "Otro",
];

/**
 * Idempotently seeds the two CRM pipelines (Ventas, Postventa), their default
 * stages, and a starter set of Postventa complaint types for a workspace.
 *
 * Called once when a workspace is created (lib/workspace.ts) and defensively
 * from the CRM pages/routes themselves, so a workspace created before the CRM
 * shipped is backfilled on first visit instead of needing a manual migration
 * script run against production.
 */
export async function ensureCrmDefaults(workspaceId: string): Promise<void> {
  await ensurePipeline(workspaceId, VENTAS_KEY, "Ventas", VENTAS_STAGES);
  await ensurePipeline(workspaceId, POSTVENTA_KEY, "Postventa", POSTVENTA_STAGES);

  await prisma.complaintType.createMany({
    data: DEFAULT_COMPLAINT_TYPES.map((name) => ({ workspaceId, name })),
    skipDuplicates: true,
  });
}

async function ensurePipeline(
  workspaceId: string,
  key: string,
  name: string,
  stages: { name: string; order: number; isWon?: boolean; isLost?: boolean }[]
) {
  const pipeline = await prisma.pipeline.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, name },
    update: {},
  });

  await prisma.stage.createMany({
    data: stages.map((stage) => ({
      pipelineId: pipeline.id,
      name: stage.name,
      order: stage.order,
      isWon: stage.isWon ?? false,
      isLost: stage.isLost ?? false,
    })),
    skipDuplicates: true,
  });

  return pipeline;
}
