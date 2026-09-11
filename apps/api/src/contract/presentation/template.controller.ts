import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "@/auth/auth.http-contract";
import { Roles, RolesGuard } from "@/auth/auth.http-contract";
import { PublicHttpException } from "@/errors";
import { PutActiveTemplateDto } from "@/contract/presentation/put-active-template.dto";
import {
  ActiveTemplateNotFound,
  ReadActiveTemplate,
} from "@/contract/application/read-active-template/read-active-template";
import { InvalidTemplateDefinition } from "@/contract/domain/template-definition";
import {
  PutActiveTemplate,
  TemplateRevisionConflict,
  type PutActiveTemplateResult,
} from "@/contract/application/publish-template/template-publication";
import { TemplatePublicationLogger } from "./template-publication.logger";

@Controller("templates")
export class TemplateController {
  constructor(
    private readonly readActiveTemplate: ReadActiveTemplate,
    private readonly putActiveTemplate: PutActiveTemplate,
    private readonly logger: TemplatePublicationLogger,
  ) {}

  @Get("active")
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("ADMIN", "MEMBER")
  async active(@Req() request: AuthenticatedRequest) {
    try {
      return await this.readActiveTemplate.execute(request.identity!.tenantId);
    } catch (error) {
      if (error instanceof ActiveTemplateNotFound)
        throw new NotFoundException();
      throw error;
    }
  }

  @Put("active")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles("ADMIN")
  async putActive(
    @Req() request: AuthenticatedRequest,
    @Body() body: PutActiveTemplateDto,
  ): Promise<PutActiveTemplateResult> {
    const identity = request.identity!;
    try {
      const result = await this.putActiveTemplate.execute({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        expectedRevision: body.expectedRevision,
        definition: body.definition,
      });
      const fields = {
        tenantId: identity.tenantId,
        actorId: identity.sub,
        logicalTemplateId: result.template.logicalTemplateId,
        templateVersionId: result.template.templateVersionId,
        expectedRevision: body.expectedRevision,
        revision: result.template.revision,
      };
      if (result.outcome === "CREATED") this.logger.created(fields);
      else if (result.outcome === "PUBLISHED") this.logger.published(fields);
      else this.logger.unchanged(fields);
      return result;
    } catch (error) {
      const reason = templatePublicationErrorCode(error);
      if (!reason) throw error;
      this.logger.rejected({
        tenantId: identity.tenantId,
        actorId: identity.sub,
        expectedRevision: body.expectedRevision,
        reason,
      });
      throw new PublicHttpException(
        reason === "INVALID_TEMPLATE_DEFINITION" ? 400 : 409,
        { code: reason },
      );
    }
  }
}

function templatePublicationErrorCode(error: unknown) {
  if (error instanceof InvalidTemplateDefinition)
    return "INVALID_TEMPLATE_DEFINITION" as const;
  if (error instanceof TemplateRevisionConflict)
    return "TEMPLATE_REVISION_CONFLICT" as const;
  return undefined;
}
