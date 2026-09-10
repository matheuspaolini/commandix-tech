import { PrismaClient } from "@prisma/client";

export {
  OutboxFailureReason,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

export function createPrismaClient() {
  return new PrismaClient();
}
