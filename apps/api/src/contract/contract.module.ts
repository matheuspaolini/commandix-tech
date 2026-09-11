import { Module } from "@nestjs/common";

import { AuthModule } from "@/auth/auth.module";
import { RolesGuard } from "@/auth/auth.http-contract";
import { ACTIVE_TEMPLATE_REPOSITORY } from "@/contract/application/publish-template/active-template.repository";
import { PrismaActiveTemplateRepository } from "@/contract/infrastructure/prisma-active-template.repository";
import { ReadActiveTemplate } from "@/contract/application/read-active-template/read-active-template";
import { TemplateController } from "@/contract/presentation/template.controller";
import { ContractController } from "@/contract/presentation/contract.controller";
import { ContractCreationLogger } from "@/contract/presentation/contract-creation.logger";
import {
  CONTRACT_CREATION_TRANSACTIONS,
  CreateContract,
} from "@/contract/application/create-contract/create-contract";
import { PrismaContractCreationTransactions } from "@/contract/infrastructure/prisma-contract-creation";
import { PrismaContractDetailRepository } from "@/contract/infrastructure/prisma-contract-detail.repository";
import {
  CONTRACT_DETAIL_REPOSITORY,
  ReadContractDetail,
} from "@/contract/application/read-contract-detail/read-contract-detail";
import { ContractTransitionLogger } from "@/contract/presentation/contract-transition.logger";
import {
  PrismaContractDraftEditTransactions,
  PrismaContractStatusTransitionTransactions,
} from "@/contract/infrastructure/prisma-contract-transition";
import { TransitionStatus } from "@/contract/application/transition-status/transition-status";
import { DRAFT_EDIT_TRANSACTIONS } from "@/contract/application/edit-draft-values/draft-edit-transaction";
import { STATUS_TRANSITION_TRANSACTIONS } from "@/contract/application/transition-status/status-transition-transaction";
import { EditDraftValues } from "@/contract/application/edit-draft-values/edit-draft-values";
import { PrismaContractRegisterRepository } from "@/contract/infrastructure/prisma-contract-register.repository";
import {
  CONTRACT_REGISTER_REPOSITORY,
  ListContracts,
} from "@/contract/application/list-contracts/list-contracts";
import { PrismaContractHistoryRepository } from "@/contract/infrastructure/prisma-contract-history.repository";
import {
  CONTRACT_HISTORY_REPOSITORY,
  ReadContractHistory,
} from "@/contract/application/read-contract-history/read-contract-history";
import { PrismaTemplatePublicationTransactions } from "@/contract/infrastructure/prisma-template-publication";
import {
  PutActiveTemplate,
  TEMPLATE_PUBLICATION_TRANSACTIONS,
} from "@/contract/application/publish-template/template-publication";
import { TemplatePublicationLogger } from "@/contract/presentation/template-publication.logger";

@Module({
  imports: [AuthModule],
  controllers: [TemplateController, ContractController],
  providers: [
    RolesGuard,
    ContractCreationLogger,
    ContractTransitionLogger,
    TemplatePublicationLogger,
    PrismaContractDraftEditTransactions,
    PrismaContractStatusTransitionTransactions,
    PrismaContractCreationTransactions,
    PrismaTemplatePublicationTransactions,
    PrismaContractDetailRepository,
    PrismaContractRegisterRepository,
    PrismaContractHistoryRepository,
    {
      provide: DRAFT_EDIT_TRANSACTIONS,
      useExisting: PrismaContractDraftEditTransactions,
    },
    {
      provide: STATUS_TRANSITION_TRANSACTIONS,
      useExisting: PrismaContractStatusTransitionTransactions,
    },
    {
      provide: TransitionStatus,
      useFactory: (transactions) => new TransitionStatus(transactions),
      inject: [STATUS_TRANSITION_TRANSACTIONS],
    },
    {
      provide: EditDraftValues,
      useFactory: (transactions) => new EditDraftValues(transactions),
      inject: [DRAFT_EDIT_TRANSACTIONS],
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
