import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => `decrypted:${value}`,
}));
import { createInstagramContext, getUserMedia } from "@/lib/instagram/provider";

const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status })
  );
}

describe("Instagram provider (direct Meta app)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("builds a context by decrypting the stored Meta access token", async () => {
    expect(
      await createInstagramContext({
        provider: "META",
        workspaceId: "workspace",
        instagramId: "ig",
        accessToken: "encrypted",
      })
    ).toEqual({ provider: "META", accessToken: "decrypted:encrypted" });
  });

  it("preserves direct Meta requests", async () => {
    respond({ data: [{ id: "media" }] });
    expect(
      await getUserMedia({
        context: { provider: "META", accessToken: "meta" },
        limit: 3,
      })
    ).toEqual([{ id: "media" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("graph.instagram.com");
  });
});
