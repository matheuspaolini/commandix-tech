import { createPrismaClient, PrismaClient } from "@commandix/database";
import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { WorkerRuntimeConfig } from "@/runtime-config";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(config: WorkerRuntimeConfig) {
    this.client = createPrismaClient({ datasourceUrl: config.databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
