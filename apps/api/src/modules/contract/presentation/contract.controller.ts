import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "@/modules/auth/auth.http-contract";
import { Roles, RolesGuard } from "@/modules/auth/auth.http-contract";
import { PublicHttpException } from "@/platform/errors";
import { ContractCreationLogger } from "./contract-creation.logger";
import { InvalidContractValues } from "@/modules/contract/domain/contract-values";
import {
  ActiveTemplateRequired,
  CreateContract,
} from "@/modules/contract/application/create-contract/create-contract";
import { CreateContractDto } from "@/modules/contract/presentation/create-contract.dto";
import {
  ContractNotFound,
  ReadContractDetail,
} from "@/modules/contract/application/read-contract-detail/read-contract-detail";
import { ActivateContractDto } from "@/modules/contract/presentation/activate-contract.dto";
import { CloseContractDto } from "@/modules/contract/presentation/close-contract.dto";
import { ContractTransitionLogger } from "./contract-transition.logger";
import { requestContext } from "@/platform/http";
import {
  ContractRevisionConflict,
  ContractStatusConflict,
  TransitionStatus,
} from "@/modules/contract/application/transition-status/transition-status";
import {
  ListContracts,
  parseContractRegisterQuery,
} from "@/modules/contract/application/list-contracts/list-contracts";
import { InvalidContractPagination } from "@/modules/contract/application/list-contracts/contract-register-cursor";
import { ReadContractHistory } from "@/modules/contract/application/read-contract-history/read-contract-history";
import { EditDraftValuesDto } from "@/modules/contract/presentation/edit-draft-values.dto";
import { EditDraftValues } from "@/modules/contract/application/edit-draft-values/edit-draft-values";
import { MigrateDraftDto } from "@/modules/contract/presentation/migrate-draft.dto";
import {
  MigrateDraft,
  TemplateVersionNotActive,
  TemplateVersionNotFound,
} from "@/modules/contract/application/migrate-draft/migrate-draft";

@Controller("contracts")
@UseGuards(AccessTokenGuard, RolesGuard)
export class ContractController {
  constructor(
    private readonly createContract: CreateContract,
    private readonly logger: ContractCreationLogger,
    private readonly readContractDetail: ReadContractDetail,
    private readonly transitionStatus: TransitionStatus,
    private readonly transitionLogger: ContractTransitionLogger,
    private readonly listContracts: ListContracts,
    private readonly readContractHistory: ReadContractHistory,
    private readonly editDraftValues: EditDraftValues,
    private readonly migrateDraft: MigrateDraft,
  ) {}

  @Get()
  @Roles("ADMIN", "MEMBER")
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    try {
      const pagination = parseContractRegisterQuery(query);
      return await this.listContracts.execute({
        tenantId: request.identity!.tenantId,
        ...pagination,
      });
    } catch (error) {
      if (error instanceof InvalidContractPagination)
        throw new PublicHttpException(400, { code: "INVALID_PAGINATION" });
      throw error;
    }
  }

  @Post(":id/migrate")
  @HttpCode(200)
  @Roles("ADMIN")
  async migrate(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
    @Body() body: MigrateDraftDto,
  ) {
    const identity = request.identity!;
    const fields = {
      tenantId: identity.tenantId,
      actorId: identity.sub,
      contractId,
      targetVersionId: body.targetVersionId,
      expectedRevision: body.expectedRevision,
    };
    try {
      const contract = await this.migrateDraft.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        targetVersionId: body.targetVersionId,
        suppliedValues: body.values,
      });
      if (contract.revision === body.expectedRevision)
        this.transitionLogger.migrationUnchanged({
          ...fields,
          revision: contract.revision,
        });
      else
        this.transitionLogger.migrated({
          ...fields,
          revision: contract.revision,
        });
      return contract;
    } catch (error) {
      if (error instanceof InvalidContractValues) {
        this.transitionLogger.migrationRejected({
          ...fields,
          reason: "INVALID_CONTRACT_VALUES",
        });
        throw new PublicHttpException(400, {
          code: "INVALID_CONTRACT_VALUES",
          issues: error.issues,
        });
      }
      const code = migrationErrorCode(error);
      if (!code) throw error;
      this.transitionLogger.migrationRejected({ ...fields, reason: code });
      throw new PublicHttpException(
        code === "CONTRACT_NOT_FOUND" || code === "TEMPLATE_VERSION_NOT_FOUND"
          ? 404
          : 409,
        { code },
      );
    }
  }

  @Put(":id/values")
  @Roles("ADMIN")
  async editValues(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
    @Body() body: EditDraftValuesDto,
  ) {
    const identity = request.identity!;
    try {
      const contract = await this.editDraftValues.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        suppliedValues: body.values,
        clearedKeys: body.clearedKeys ?? [],
      });
      const fields = {
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        revision: contract.revision,
      };
      if (contract.revision === body.expectedRevision)
        this.transitionLogger.unchanged(fields);
      else this.transitionLogger.edited(fields);
      return contract;
    } catch (error) {
      if (error instanceof InvalidContractValues) {
        this.transitionLogger.editRejected({
          tenantId: identity.tenantId,
          actorId: identity.sub,
          contractId,
          expectedRevision: body.expectedRevision,
          reason: "INVALID_CONTRACT_VALUES",
        });
        throw new PublicHttpException(400, {
          code: "INVALID_CONTRACT_VALUES",
          issues: error.issues,
        });
      }
      const code = transitionErrorCode(error);
      if (!code) throw error;
      this.transitionLogger.editRejected({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        reason: code,
      });
      throw new PublicHttpException(code === "CONTRACT_NOT_FOUND" ? 404 : 409, {
        code,
      });
    }
  }

  @Get(":id/history")
  @Roles("ADMIN", "MEMBER")
  async history(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
  ) {
    try {
      return await this.readContractHistory.execute({
        tenantId: request.identity!.tenantId,
        contractId,
      });
    } catch (error) {
      if (error instanceof ContractNotFound)
        throw new PublicHttpException(404, { code: "CONTRACT_NOT_FOUND" });
      throw error;
    }
  }

  @Post(":id/activate")
  @HttpCode(200)
  @Roles("ADMIN")
  async activate(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
    @Body() body: ActivateContractDto,
  ) {
    const identity = request.identity!;
    try {
      const result = await this.transitionStatus.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        targetStatus: "ACTIVE",
        correlationId: requestContext.correlationId()!,
      });
      if (result.targetStatus !== "ACTIVE")
        throw new Error("Unexpected transition result");
      this.transitionLogger.activated({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        revision: result.contract.revision,
        eventId: result.eventId,
      });
      return result.contract;
    } catch (error) {
      const code = transitionErrorCode(error);
      if (!code) throw error;
      this.transitionLogger.rejected({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        reason: code,
      });
      throw new PublicHttpException(code === "CONTRACT_NOT_FOUND" ? 404 : 409, {
        code,
      });
    }
  }

  @Post(":id/close")
  @HttpCode(200)
  @Roles("ADMIN")
  async close(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
    @Body() body: CloseContractDto,
  ) {
    const identity = request.identity!;
    try {
      const result = await this.transitionStatus.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        targetStatus: "CLOSED",
        correlationId: requestContext.correlationId()!,
      });
      if (result.targetStatus !== "CLOSED")
        throw new Error("Unexpected transition result");
      this.transitionLogger.closed({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        revision: result.contract.revision,
      });
      return result.contract;
    } catch (error) {
      const code = transitionErrorCode(error);
      if (!code) throw error;
      this.transitionLogger.closureRejected({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        contractId,
        expectedRevision: body.expectedRevision,
        reason: code,
      });
      throw new PublicHttpException(code === "CONTRACT_NOT_FOUND" ? 404 : 409, {
        code,
      });
    }
  }

  @Get(":id")
  @Roles("ADMIN", "MEMBER")
  async detail(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe({ version: "4" })) contractId: string,
  ) {
    try {
      return await this.readContractDetail.execute({
        tenantId: request.identity!.tenantId,
        contractId,
      });
    } catch (error) {
      if (error instanceof ContractNotFound) {
        throw new PublicHttpException(404, { code: "CONTRACT_NOT_FOUND" });
      }
      throw error;
    }
  }

  @Post()
  @Roles("ADMIN", "MEMBER")
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateContractDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = request.identity!;
    try {
      const created = await this.createContract.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        suppliedValues: body.values,
      });
      response.location(`/contracts/${created.id}`);
      this.logger.created(identity.tenantId, identity.sub, created);
      return created;
    } catch (error) {
      if (error instanceof ActiveTemplateRequired) {
        this.logger.rejected(
          identity.tenantId,
          identity.sub,
          "ACTIVE_TEMPLATE_REQUIRED",
        );
        throw new PublicHttpException(409, {
          code: "ACTIVE_TEMPLATE_REQUIRED",
        });
      }
      if (error instanceof InvalidContractValues) {
        this.logger.rejected(
          identity.tenantId,
          identity.sub,
          "INVALID_CONTRACT_VALUES",
        );
        throw new PublicHttpException(400, {
          code: "INVALID_CONTRACT_VALUES",
          issues: error.issues,
        });
      }
      throw error;
    }
  }
}

function transitionErrorCode(error: unknown) {
  if (error instanceof ContractNotFound) return "CONTRACT_NOT_FOUND" as const;
  if (error instanceof ContractRevisionConflict)
    return "CONTRACT_REVISION_CONFLICT" as const;
  if (error instanceof ContractStatusConflict)
    return "CONTRACT_STATUS_CONFLICT" as const;
  return undefined;
}

function migrationErrorCode(error: unknown) {
  const transitionCode = transitionErrorCode(error);
  if (transitionCode) return transitionCode;
  if (error instanceof TemplateVersionNotFound)
    return "TEMPLATE_VERSION_NOT_FOUND" as const;
  if (error instanceof TemplateVersionNotActive)
    return "TEMPLATE_VERSION_NOT_ACTIVE" as const;
  return undefined;
}
