import { expect, test } from "bun:test";

import {
  TenantEntity,
  TenantIdentifier,
  UserEntity,
  UserIdentifier,
} from "./entities";

test("Tenant onboarding creates an Admin belonging to its Tenant", () => {
  const tenant = TenantEntity.create({
    id: TenantIdentifier.from("tenant-id"),
    slug: "acme",
  });
  const user = UserEntity.createAdmin({
    id: UserIdentifier.from("user-id"),
    tenantId: tenant.id,
    email: "admin@acme.test",
  });

  expect({ tenant: tenant.snapshot(), user: user.snapshot() }).toStrictEqual({
    tenant: { id: "tenant-id", slug: "acme" },
    user: {
      id: "user-id",
      tenantId: "tenant-id",
      email: "admin@acme.test",
      role: "ADMIN",
    },
  });
});
