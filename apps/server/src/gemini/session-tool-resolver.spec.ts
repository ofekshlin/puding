import { CredentialStore } from "../credentials/credential-store";
import { GeminiTool } from "./gemini-tool.interface";
import { SessionToolResolver, notConnectedNote } from "./session-tool-resolver";

const tool = (name: string, requires?: GeminiTool["requires"]): GeminiTool =>
  ({ name, requires, declaration: { name } }) as unknown as GeminiTool;

describe("SessionToolResolver", () => {
  const catalogue = [
    tool("search_web"),
    tool("play_song", "spotify"),
    tool("read_notion_page", "notion"),
    tool("start_devin_session", "devin"),
  ];
  let credentials: jest.Mocked<CredentialStore>;
  let resolver: SessionToolResolver;

  beforeEach(() => {
    credentials = { listConnected: jest.fn() } as any;
    resolver = new SessionToolResolver(catalogue, credentials);
  });

  it("keeps provider-free tools and tools for healthy connections only", async () => {
    credentials.listConnected.mockResolvedValue([
      { provider: "spotify", kind: "oauth", source: "db", settings: {} },
      {
        provider: "notion",
        kind: "oauth",
        source: "db",
        settings: {},
        lastError: "token revoked",
      },
    ]);

    const { tools, note } = await resolver.resolve("u1");

    expect(credentials.listConnected).toHaveBeenCalledWith("u1");
    expect(tools.map((t) => t.name)).toEqual(["search_web", "play_song"]);
    expect(note).toContain("Notion and Devin are not connected");
  });

  it("adds no note when everything is connected", async () => {
    credentials.listConnected.mockResolvedValue(
      (["spotify", "notion", "devin"] as const).map((provider) => ({
        provider,
        kind: "static_token" as const,
        source: "env" as const,
        settings: {},
      })),
    );
    const { tools, note } = await resolver.resolve("u1");
    expect(tools).toHaveLength(4);
    expect(note).toBeUndefined();
  });

  it("falls back to provider-free tools when connections can't be loaded", async () => {
    credentials.listConnected.mockRejectedValue(new Error("db down"));
    const { tools } = await resolver.resolve("u1");
    expect(tools.map((t) => t.name)).toEqual(["search_web"]);
  });

  it("words the note for one service", () => {
    expect(notConnectedNote(["spotify"])).toBe(
      "Spotify is not connected for this user. If asked, say they can connect it in Puding's Settings.",
    );
  });
});
