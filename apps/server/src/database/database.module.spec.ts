import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "../config/config.service";
import { CredentialStore } from "../credentials/credential-store";
import { EnvCredentialStore } from "../credentials/env-credential-store";
import { NotifyingCredentialStore } from "../credentials/notifying-credential-store";
import { EnvUserDirectory } from "../users/env-user-directory";
import { UserDirectory } from "../users/user-directory";
import { DATABASE } from "./database";
import { DatabaseModule } from "./database.module";

describe("DatabaseModule without DATABASE_URL", () => {
  it("falls back to env credentials and the implicit local user", async () => {
    const config = {
      getDatabaseUrl: () => undefined,
      getNotionToken: () => "ntn_env",
      getSpotifyRefreshToken: () => undefined,
      getDevinApiKey: () => undefined,
      getDevinOrgId: () => undefined,
      isPreview: () => false,
      isDevinEnabledInPreview: () => false,
    };

    @Global()
    @Module({
      providers: [{ provide: ConfigService, useValue: config }],
      exports: [ConfigService],
    })
    class FakeConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [FakeConfigModule, DatabaseModule],
    }).compile();

    expect(moduleRef.get(DATABASE)).toBeNull();
    const store = moduleRef.get(CredentialStore);
    expect(store).toBeInstanceOf(NotifyingCredentialStore);
    expect((store as any).inner).toBeInstanceOf(EnvCredentialStore);
    expect(moduleRef.get(UserDirectory)).toBeInstanceOf(EnvUserDirectory);
    expect((await store.get("local", "notion"))?.secret).toEqual({
      accessToken: "ntn_env",
    });
    await moduleRef.close();
  });
});
