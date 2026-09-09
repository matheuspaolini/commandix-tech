import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from "./access-token.guard";
import { AuthenticationFailed, AuthService } from "./auth.service";
import { CredentialsDto } from "./dto";
import { InvalidIdentityInput } from "../tenant/identity";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: CredentialsDto) {
    try {
      return await this.auth.login(body);
    } catch (error) {
      if (error instanceof InvalidIdentityInput)
        throw new BadRequestException();
      if (error instanceof AuthenticationFailed)
        throw new UnauthorizedException();
      throw error;
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
