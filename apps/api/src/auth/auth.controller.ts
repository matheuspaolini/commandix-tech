import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "./access-token.guard";
import { AuthService } from "./auth.service";
import {
  BrowserOriginGuard,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "./browser-auth.http";
import { CredentialsDto } from "./dto";
import { AuthenticationFailed } from "./errors";
import { RefreshSessionService } from "./refresh-session.service";
import { RuntimeConfig } from "../runtime-config";
import { InvalidIdentityInput } from "../tenant/identity";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshSessions: RefreshSessionService,
    private readonly config: RuntimeConfig,
  ) {}

  @Post("sign-in")
  @UseGuards(BrowserOriginGuard)
  @HttpCode(200)
  async signIn(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const issued = await this.auth.signIn(body);
      setRefreshCookie(response, issued, this.config);
      return { accessToken: issued.accessToken };
    } catch (error) {
      if (error instanceof InvalidIdentityInput)
        throw new BadRequestException();
      if (error instanceof AuthenticationFailed)
        throw new UnauthorizedException();
      throw error;
    }
  }

  @Post("refresh")
  @UseGuards(BrowserOriginGuard)
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const issued = await this.refreshSessions.rotate(
        readRefreshCookie(request),
      );
      setRefreshCookie(response, issued, this.config);
      return { accessToken: issued.accessToken };
    } catch (error) {
      clearRefreshCookie(response, this.config);
      if (error instanceof AuthenticationFailed) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }

  @Delete("sign-out")
  @UseGuards(BrowserOriginGuard)
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.refreshSessions.revoke(readRefreshCookie(request));
    } finally {
      clearRefreshCookie(response, this.config);
    }
  }

  @Get("identity")
  @UseGuards(AccessTokenGuard)
  async identity(@Req() request: AuthenticatedRequest) {
    try {
      return await this.auth.identity(request.identity!);
    } catch (error) {
      if (error instanceof AuthenticationFailed)
        throw new UnauthorizedException();
      throw error;
    }
  }
}
