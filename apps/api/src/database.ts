import { createPrismaClient, PrismaClient } from "@commandix/database";
import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Global()
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
