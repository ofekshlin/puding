import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { CredentialCipher } from "../credentials/credential-cipher";
import { CredentialStore } from "../credentials/credential-store";
import { EnvCredentialStore } from "../credentials/env-credential-store";
import { LayeredCredentialStore } from "../credentials/layered-credential-store";
import { NotifyingCredentialStore } from "../credentials/notifying-credential-store";
import { PostgresCredentialStore } from "../credentials/postgres-credential-store";
import { EnvUserDirectory } from "../users/env-user-directory";
import { PostgresUserDirectory } from "../users/postgres-user-directory";
import { UserDirectory } from "../users/user-directory";
import { DATABASE, DatabaseConnection, connectDatabase } from "./database";
import {
  InMemoryUsageLimiter,
  PostgresUsageLimiter,
  UsageLimiter,
} from "./usage-limiter";
import { ConnectionEvents } from "../credentials/connection-events";

const logger = new Logger("DatabaseModule");

/**
 * Postgres (when `DATABASE_URL` is set) plus the `CredentialStore` and
 * `UserDirectory` built on it. Without a database both fall back to env vars
 * and the implicit `local` user, so local dev needs no database.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (
        config: ConfigService,
      ): Promise<DatabaseConnection | null> => {
        const url = config.getDatabaseUrl();
        if (!url) {
          logger.warn(
            "DATABASE_URL is not set: using env credentials for the implicit local user.",
          );
          return null;
        }
        const connection = await connectDatabase(url);
        logger.log("Connected to Postgres and applied migrations.");
        return connection;
      },
    },
    EnvCredentialStore,
    ConnectionEvents,
    {
      provide: UsageLimiter,
      inject: [DATABASE],
      useFactory: (connection: DatabaseConnection | null): UsageLimiter =>
        connection
          ? new PostgresUsageLimiter(connection.db)
          : new InMemoryUsageLimiter(),
    },
    {
      provide: UserDirectory,
      inject: [DATABASE],
      useFactory: (connection: DatabaseConnection | null): UserDirectory =>
        connection
          ? new PostgresUserDirectory(connection.db)
          : new EnvUserDirectory(),
    },
    {
      provide: CredentialStore,
      inject: [
        DATABASE,
        ConfigService,
        EnvCredentialStore,
        UserDirectory,
        ConnectionEvents,
      ],
      useFactory: (
        connection: DatabaseConnection | null,
        config: ConfigService,
        env: EnvCredentialStore,
        users: UserDirectory,
        events: ConnectionEvents,
      ): CredentialStore => {
        if (!connection) return new NotifyingCredentialStore(env, events);
        const cipher = new CredentialCipher(
          config.getCredentialsEncryptionKeys(),
        );
        logger.log(
          `Credential store: Postgres (key v${cipher.currentKeyVersion}), env fallback for "${config.getEnvCredentialsScope()}".`,
        );
        return new NotifyingCredentialStore(
          new LayeredCredentialStore(
            new PostgresCredentialStore(connection.db, cipher),
            env,
            users,
            config.getEnvCredentialsScope(),
          ),
          events,
        );
      },
    },
  ],
  exports: [
    DATABASE,
    CredentialStore,
    UserDirectory,
    UsageLimiter,
    ConnectionEvents,
  ],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly connection: DatabaseConnection | null,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.connection?.close();
  }
}
