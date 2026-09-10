import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "../auth/access-token.guard";
import { Roles, RolesGuard } from "../auth/roles";
import {
  ActiveTemplateNotFound,
  ReadActiveTemplate,
} from "./read-active-template";

@Controller("templates")
export class TemplateController {
  constructor(private readonly readActiveTemplate: ReadActiveTemplate) {}

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
}
