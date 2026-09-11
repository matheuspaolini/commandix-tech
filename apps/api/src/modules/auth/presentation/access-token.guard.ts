import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import {
  ACCESS_TOKEN_CODEC,
  type AccessTokenCodec,
} from "@/modules/auth/application/token-codecs";
import type { AuthenticatedIdentity } from "@/modules/auth/domain/authenticated-identity";

export type AuthenticatedRequest = Request & {
  identity?: AuthenticatedIdentity;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_CODEC) private readonly tokens: AccessTokenCodec,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === "string" &&
      /^Bearer ([^\s]+)$/.exec(authorization);
    const claims = match ? this.tokens.verify(match[1]!) : null;
    if (!claims) throw new UnauthorizedException();
    request.identity = claims;
    return true;
  }
}
