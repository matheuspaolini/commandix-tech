import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "../auth/access-token.guard";
import { Roles, RolesGuard } from "../auth/roles";
import { PublicHttpException } from "../errors";
import { ContractCreationLogger } from "./contract-creation.logger";
import { InvalidContractValues } from "./contract-values";
import { ActiveTemplateRequired, CreateContract } from "./create-contract";
import { CreateContractDto } from "./create-contract.dto";
import { ContractNotFound, ReadContractDetail } from "./read-contract-detail";

@Controller("contracts")
@UseGuards(AccessTokenGuard, RolesGuard)
export class ContractController {
  constructor(
    private readonly createContract: CreateContract,
    private readonly logger: ContractCreationLogger,
    private readonly readContractDetail: ReadContractDetail,
  ) {}

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
