import { ConnectionEvents } from "./connection-events";
import { CredentialStore } from "./credential-store";
import { NotifyingCredentialStore } from "./notifying-credential-store";

describe("NotifyingCredentialStore", () => {
  it("announces saves, deletes and errors after they succeed", async () => {
    const inner = {
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      markError: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<CredentialStore>;
    const events = new ConnectionEvents();
    const listener = jest.fn();
    events.onChanged(listener);
    const store = new NotifyingCredentialStore(inner, events);

    await store.get("u1", "notion");
    expect(listener).not.toHaveBeenCalled();

    await store.save("u1", {
      provider: "notion",
      kind: "oauth",
      secret: { accessToken: "t" },
      settings: {},
    });
    await store.delete("u1", "spotify");
    await store.markError("u1", "devin", "bad key");

    expect(listener.mock.calls).toEqual([
      ["u1", "notion", "saved"],
      ["u1", "spotify", "deleted"],
      ["u1", "devin", "errored"],
    ]);
  });

  it("stays quiet when the write fails", async () => {
    const inner = {
      delete: jest.fn().mockRejectedValue(new Error("read only")),
    } as unknown as jest.Mocked<CredentialStore>;
    const events = new ConnectionEvents();
    const listener = jest.fn();
    events.onChanged(listener);

    await expect(
      new NotifyingCredentialStore(inner, events).delete("u1", "devin"),
    ).rejects.toThrow("read only");
    expect(listener).not.toHaveBeenCalled();
  });
});
