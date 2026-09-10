import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/roles";
import { ACTIVE_TEMPLATE_REPOSITORY } from "./active-template.repository";
import { PrismaActiveTemplateRepository } from "./prisma-active-template.repository";
import { ReadActiveTemplate } from "./read-active-template";
import { TemplateController } from "./template.controller";

@Module({
  imports: [AuthModule],
  controllers: [TemplateController],
  providers: [
    RolesGuard,
    PrismaActiveTemplateRepository,
    {
      provide: ACTIVE_TEMPLATE_REPOSITORY,
      useExisting: PrismaActiveTemplateRepository,
    },
    {
      provide: ReadActiveTemplate,
      useFactory: (templates) => new ReadActiveTemplate(templates),
      inject: [ACTIVE_TEMPLATE_REPOSITORY],
    },
  ],
})
export class ContractModule {}
