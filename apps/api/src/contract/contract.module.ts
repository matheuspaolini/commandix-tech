import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/roles";
import { ACTIVE_TEMPLATE_REPOSITORY } from "./active-template.repository";
import { PrismaActiveTemplateRepository } from "./prisma-active-template.repository";
import { ReadActiveTemplate } from "./read-active-template";
import { TemplateController } from "./template.controller";
import { ContractController } from "./contract.controller";
import { ContractCreationLogger } from "./contract-creation.logger";
import {
  CONTRACT_CREATION_TRANSACTIONS,
  CreateContract,
} from "./create-contract";
import { PrismaContractCreationTransactions } from "./prisma-contract-creation";
import { PrismaContractDetailRepository } from "./prisma-contract-detail.repository";
import {
  CONTRACT_DETAIL_REPOSITORY,
  ReadContractDetail,
} from "./read-contract-detail";

@Module({
  imports: [AuthModule],
  controllers: [TemplateController, ContractController],
  providers: [
    RolesGuard,
    ContractCreationLogger,
    PrismaContractCreationTransactions,
    PrismaContractDetailRepository,
    {
      provide: CONTRACT_CREATION_TRANSACTIONS,
      useExisting: PrismaContractCreationTransactions,
    },
    {
      provide: CreateContract,
      useFactory: (transactions) => new CreateContract(transactions),
      inject: [CONTRACT_CREATION_TRANSACTIONS],
    },
    {
      provide: CONTRACT_DETAIL_REPOSITORY,
      useExisting: PrismaContractDetailRepository,
    },
    {
      provide: ReadContractDetail,
      useFactory: (contracts) => new ReadContractDetail(contracts),
      inject: [CONTRACT_DETAIL_REPOSITORY],
    },
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
