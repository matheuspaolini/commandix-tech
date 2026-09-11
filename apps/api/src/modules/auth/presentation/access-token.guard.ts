import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import {
  AccessTokenService,
  type AccessTokenClaims,
} from "@/modules/auth/domain/access-token";

export type AuthenticatedRequest = Request & { identity?: AccessTokenClaims };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokens: AccessTokenService) {}

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
