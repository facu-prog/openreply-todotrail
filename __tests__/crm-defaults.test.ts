import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    pipeline: { upsert: vi.fn() },
    stage: { createMany: vi.fn() },
    complaintType: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { ensureCrmDefaults, POSTVENTA_KEY, VENTAS_KEY } from "../lib/crm/defaults";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pipeline.upsert.mockImplementation(({ where }: { where: { workspaceId_key: { key: string } } }) =>
    Promise.resolve({ id: `pipeline_${where.workspaceId_key.key}` })
  );
});

describe("ensureCrmDefaults", () => {
  it("seeds exactly the Ventas and Postventa pipelines, keyed and idempotent", async () => {
    await ensureCrmDefaults("workspace_1");

    expect(mockPrisma.pipeline.upsert).toHaveBeenCalledTimes(2);
    const keys = mockPrisma.pipeline.upsert.mock.calls.map(
      (call: unknown[]) =>
        (call[0] as { where: { workspaceId_key: { key: string } } }).where.workspaceId_key.key
    );
    expect(keys.sort()).toEqual([POSTVENTA_KEY, VENTAS_KEY].sort());
  });

  it("gives Ventas an ordered stage set including Won and Lost", async () => {
    await ensureCrmDefaults("workspace_1");

    const ventasCall = mockPrisma.stage.createMany.mock.calls.find((call: unknown[]) =>
      (call[0] as { data: { pipelineId: string }[] }).data.every((s) => s.pipelineId === "pipeline_ventas")
    );
    const stageNames = (ventasCall![0] as { data: { name: string }[] }).data.map((s) => s.name);
    expect(stageNames).toEqual(["Incoming leads", "In progress", "Won", "Lost"]);
  });

  it("skips duplicates so a repeat call never creates a second set of stages or complaint types", async () => {
    await ensureCrmDefaults("workspace_1");
    for (const call of mockPrisma.stage.createMany.mock.calls) {
      expect(call[0].skipDuplicates).toBe(true);
    }
    expect(mockPrisma.complaintType.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it("seeds a starter set of Postventa complaint types", async () => {
    await ensureCrmDefaults("workspace_1");
    const [{ data }] = mockPrisma.complaintType.createMany.mock.calls[0];
    expect(data.map((d: { name: string }) => d.name)).toEqual([
      "Talle incorrecto",
      "Producto dañado",
      "Demora en envío",
      "Cambio/Devolución",
      "Otro",
    ]);
    expect(data.every((d: { workspaceId: string }) => d.workspaceId === "workspace_1")).toBe(true);
  });
});
