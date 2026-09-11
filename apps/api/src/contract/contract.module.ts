import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/presentation/roles";
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
import { ContractTransitionLogger } from "./contract-transition.logger";
import { PrismaContractMutationTransactions } from "./prisma-contract-transition";
import { TransitionStatus } from "./transition-status";
import { CONTRACT_MUTATION_TRANSACTIONS } from "./contract-mutation";
import { EditDraftValues } from "./edit-draft-values";
import { PrismaContractRegisterRepository } from "./prisma-contract-register.repository";
import { CONTRACT_REGISTER_REPOSITORY, ListContracts } from "./list-contracts";
import { PrismaContractHistoryRepository } from "./prisma-contract-history.repository";
import {
  CONTRACT_HISTORY_REPOSITORY,
  ReadContractHistory,
} from "./read-contract-history";
import { PrismaTemplatePublicationTransactions } from "./prisma-template-publication";
import {
  PutActiveTemplate,
  TEMPLATE_PUBLICATION_TRANSACTIONS,
} from "./template-publication";
import { TemplatePublicationLogger } from "./template-publication.logger";

@Module({
  imports: [AuthModule],
  controllers: [TemplateController, ContractController],
  providers: [
    RolesGuard,
    ContractCreationLogger,
    ContractTransitionLogger,
    TemplatePublicationLogger,
    PrismaContractMutationTransactions,
    PrismaContractCreationTransactions,
    PrismaTemplatePublicationTransactions,
    PrismaContractDetailRepository,
    PrismaContractRegisterRepository,
    PrismaContractHistoryRepository,
    {
      provide: CONTRACT_MUTATION_TRANSACTIONS,
      useExisting: PrismaContractMutationTransactions,
    },
    {
      provide: TransitionStatus,
      useFactory: (transactions) => new TransitionStatus(transactions),
      inject: [CONTRACT_MUTATION_TRANSACTIONS],
    },
    {
      provide: EditDraftValues,
      useFactory: (transactions) => new EditDraftValues(transactions),
      inject: [CONTRACT_MUTATION_TRANSACTIONS],
    },
    {
      provide: CONTRACT_CREATION_TRANSACTIONS,
      useExisting: PrismaContractCreationTransactions,
    },
    {
      provide: TEMPLATE_PUBLICATION_TRANSACTIONS,
      useExisting: PrismaTemplatePublicationTransactions,
    },
    {
      provide: PutActiveTemplate,
      useFactory: (transactions) => new PutActiveTemplate(transactions),
      inject: [TEMPLATE_PUBLICATION_TRANSACTIONS],
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
    {
      provide: CONTRACT_REGISTER_REPOSITORY,
      useExisting: PrismaContractRegisterRepository,
    },
    {
      provide: ListContracts,
      useFactory: (contracts) => new ListContracts(contracts),
      inject: [CONTRACT_REGISTER_REPOSITORY],
    },
    {
      provide: CONTRACT_HISTORY_REPOSITORY,
      useExisting: PrismaContractHistoryRepository,
    },
    {
      provide: ReadContractHistory,
      useFactory: (history) => new ReadContractHistory(history),
      inject: [CONTRACT_HISTORY_REPOSITORY],
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
