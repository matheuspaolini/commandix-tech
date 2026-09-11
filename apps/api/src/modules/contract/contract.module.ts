import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";
import { RolesGuard } from "@/modules/auth/auth.http-contract";
import { ACTIVE_TEMPLATE_REPOSITORY } from "@/modules/contract/application/publish-template/active-template.repository";
import { PrismaActiveTemplateRepository } from "@/modules/contract/infrastructure/prisma-active-template.repository";
import { ReadActiveTemplate } from "@/modules/contract/application/read-active-template/read-active-template";
import { TemplateController } from "@/modules/contract/presentation/template.controller";
import { ContractController } from "@/modules/contract/presentation/contract.controller";
import { ContractCreationLogger } from "@/modules/contract/presentation/contract-creation.logger";
import {
  CONTRACT_CREATION_TRANSACTIONS,
  CreateContract,
} from "@/modules/contract/application/create-contract/create-contract";
import { PrismaContractCreationTransactions } from "@/modules/contract/infrastructure/prisma-contract-creation";
import { PrismaContractDetailRepository } from "@/modules/contract/infrastructure/prisma-contract-detail.repository";
import {
  CONTRACT_DETAIL_REPOSITORY,
  ReadContractDetail,
} from "@/modules/contract/application/read-contract-detail/read-contract-detail";
import { ContractTransitionLogger } from "@/modules/contract/presentation/contract-transition.logger";
import {
  PrismaContractActivationTransactions,
  PrismaContractClosureTransactions,
  PrismaContractDraftEditTransactions,
  PrismaContractDraftMigrationTransactions,
} from "@/modules/contract/infrastructure/prisma-contract-transition";
import { TransitionStatus } from "@/modules/contract/application/transition-status/transition-status";
import { DRAFT_EDIT_TRANSACTIONS } from "@/modules/contract/application/edit-draft-values/draft-edit-transaction";
import {
  ACTIVATION_TRANSACTIONS,
  CLOSURE_TRANSACTIONS,
} from "@/modules/contract/application/transition-status/status-transition-transaction";
import { EditDraftValues } from "@/modules/contract/application/edit-draft-values/edit-draft-values";
import { MigrateDraft } from "@/modules/contract/application/migrate-draft/migrate-draft";
import { DRAFT_MIGRATION_TRANSACTIONS } from "@/modules/contract/application/migrate-draft/draft-migration-transaction";
import { PrismaContractRegisterRepository } from "@/modules/contract/infrastructure/prisma-contract-register.repository";
import {
  CONTRACT_REGISTER_REPOSITORY,
  ListContracts,
} from "@/modules/contract/application/list-contracts/list-contracts";
import { PrismaContractHistoryRepository } from "@/modules/contract/infrastructure/prisma-contract-history.repository";
import {
  CONTRACT_HISTORY_REPOSITORY,
  ReadContractHistory,
} from "@/modules/contract/application/read-contract-history/read-contract-history";
import { PrismaTemplatePublicationTransactions } from "@/modules/contract/infrastructure/prisma-template-publication";
import {
  PutActiveTemplate,
  TEMPLATE_PUBLICATION_TRANSACTIONS,
} from "@/modules/contract/application/publish-template/template-publication";
import { TemplatePublicationLogger } from "@/modules/contract/presentation/template-publication.logger";

@Module({
  imports: [AuthModule],
  controllers: [TemplateController, ContractController],
  providers: [
    RolesGuard,
    ContractCreationLogger,
    ContractTransitionLogger,
    TemplatePublicationLogger,
    PrismaContractDraftEditTransactions,
    PrismaContractDraftMigrationTransactions,
    PrismaContractActivationTransactions,
    PrismaContractClosureTransactions,
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
      provide: ACTIVATION_TRANSACTIONS,
      useExisting: PrismaContractActivationTransactions,
    },
    {
      provide: CLOSURE_TRANSACTIONS,
      useExisting: PrismaContractClosureTransactions,
    },
    {
      provide: TransitionStatus,
      useFactory: (activations, closures) =>
        new TransitionStatus(activations, closures),
      inject: [ACTIVATION_TRANSACTIONS, CLOSURE_TRANSACTIONS],
    },
    {
      provide: EditDraftValues,
      useFactory: (transactions) => new EditDraftValues(transactions),
      inject: [DRAFT_EDIT_TRANSACTIONS],
    },
    {
      provide: DRAFT_MIGRATION_TRANSACTIONS,
      useExisting: PrismaContractDraftMigrationTransactions,
    },
    {
      provide: MigrateDraft,
      useFactory: (transactions) => new MigrateDraft(transactions),
      inject: [DRAFT_MIGRATION_TRANSACTIONS],
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
