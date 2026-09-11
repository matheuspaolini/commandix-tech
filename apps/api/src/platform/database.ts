import { createPrismaClient, PrismaClient } from "@commandix/database";
import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
} from "@nestjs/common";
import { type DatabaseConnectionConfig, RuntimeConfig } from "./runtime-config";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(RuntimeConfig) config: DatabaseConnectionConfig) {
    this.client = createPrismaClient({ datasourceUrl: config.databaseUrl });
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
