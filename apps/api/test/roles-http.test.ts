import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type CanActivate,
  Controller,
  Get,
  type INestApplication,
  Module,
  Req,
  type ExecutionContext,
  UseGuards,
} from "@nestjs/common";
import request from "supertest";

import type { AuthenticatedRequest } from "@/modules/auth/presentation/access-token.guard";
import { Roles, RolesGuard } from "@/modules/auth/presentation/roles";
import { createApp } from "@/bootstrap/app";

class HeaderIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.headers["x-test-role"];
    if (role === "ADMIN" || role === "MEMBER") {
      request.identity = {
        userId: "user-id",
        tenantId: "tenant-id",
        role,
        iat: 1,
        exp: 2,
      };
    }
    return true;
  }
}

@Controller("roles")
class RoleTestController {
  @Get("admin")
  @UseGuards(HeaderIdentityGuard, RolesGuard)
  @Roles("ADMIN")
  admin() {
    return { permitted: true };
  }

  @Get("unrestricted")
  @UseGuards(HeaderIdentityGuard, RolesGuard)
  unrestricted(@Req() request: AuthenticatedRequest) {
    return { role: request.identity?.role ?? null };
  }
}

@Module({
  controllers: [RoleTestController],
  providers: [HeaderIdentityGuard, RolesGuard],
})
class RoleTestModule {}

let app: INestApplication;

beforeAll(async () => {
  app = await createApp({ rootModule: RoleTestModule, writeLog: () => {} });
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe("role enforcement", () => {
  test("permits a listed role", async () => {
    const response = await request(app.getHttpServer())
      .get("/roles/admin")
      .set("x-test-role", "ADMIN");

    expect({ status: response.status, body: response.body }).toStrictEqual({
      status: 200,
      body: { permitted: true },
    });
  });

  test("denies an authenticated unlisted role", async () => {
    const response = await request(app.getHttpServer())
      .get("/roles/admin")
      .set("x-test-role", "MEMBER");

    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 403, error: "Forbidden" });
  });

  test("requires verified identity when roles are listed", async () => {
    const response = await request(app.getHttpServer()).get("/roles/admin");

    expect({
      status: response.status,
      error: response.body.error,
    }).toStrictEqual({ status: 401, error: "Unauthorized" });
  });

  test("adds no restriction without role metadata", async () => {
    const response = await request(app.getHttpServer()).get(
      "/roles/unrestricted",
    );

    expect({ status: response.status, body: response.body }).toStrictEqual({
      status: 200,
      body: { role: null },
    });
  });
});
