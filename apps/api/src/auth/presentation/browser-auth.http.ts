import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

import { RuntimeConfig } from "@/runtime-config";
import type { IssuedSession } from "@/auth/application/refresh-session/refresh-session.service";

export const REFRESH_COOKIE = {
  name: "commandix_refresh",
  path: "/api/auth",
  httpOnly: true,
  sameSite: "strict",
} as const;

@Injectable()
export class BrowserOriginGuard implements CanActivate {
  constructor(private readonly config: RuntimeConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = readSingleHeader(request.headers.origin);

    if (origin === undefined || this.config.allowedBrowserOrigins.has(origin)) {
      return true;
    }

    throw new ForbiddenException();
  }
}

export function readRefreshCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${REFRESH_COOKIE.name}=`));
  if (matches.length !== 1) return undefined;

  return matches[0]?.slice(REFRESH_COOKIE.name.length + 1);
}

export function setRefreshCookie(
  response: Response,
  issued: IssuedSession,
  config: RuntimeConfig,
  now = new Date(),
): void {
  response.cookie(
    REFRESH_COOKIE.name,
    issued.refreshCredential,
    refreshCookieOptions(issued.expiresAt, now, config.secureRefreshCookie),
  );
}

export function clearRefreshCookie(
  response: Response,
  config: RuntimeConfig,
): void {
  response.clearCookie(
    REFRESH_COOKIE.name,
    clearedRefreshCookieOptions(config.secureRefreshCookie),
  );
}

export function refreshCookieOptions(
  expiresAt: Date,
  now: Date,
  secure: boolean,
): CookieOptions {
  const remainingMilliseconds = Math.max(
    0,
    expiresAt.getTime() - now.getTime(),
  );

  return {
    ...clearedRefreshCookieOptions(secure),
    expires: expiresAt,
    maxAge: remainingMilliseconds,
  };
}

export function clearedRefreshCookieOptions(secure: boolean): CookieOptions {
  return {
    path: REFRESH_COOKIE.path,
    httpOnly: REFRESH_COOKIE.httpOnly,
    sameSite: REFRESH_COOKIE.sameSite,
    secure,
  };
}

function readSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}
