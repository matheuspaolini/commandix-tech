import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../tenant/identity";
import type { AuthenticatedRequest } from "./access-token.guard";

export const PERMITTED_ROLES = Symbol("PERMITTED_ROLES");

export function Roles(
  ...roles: readonly [Role, ...Role[]]
): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMITTED_ROLES, roles);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permittedRoles = this.reflector.getAllAndOverride<
      readonly Role[] | undefined
    >(PERMITTED_ROLES, [context.getHandler(), context.getClass()]);
    if (!permittedRoles) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.identity) throw new UnauthorizedException();
    if (!permittedRoles.includes(request.identity.role))
      throw new ForbiddenException();
    return true;
  }
}
