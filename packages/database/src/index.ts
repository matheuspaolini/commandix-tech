import { PrismaClient } from "@prisma/client";

export {
  OutboxFailureReason,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

export type PrismaClientConfiguration = { datasourceUrl: string };

export function createPrismaClient({
  datasourceUrl,
}: PrismaClientConfiguration): PrismaClient {
  return new PrismaClient({ datasourceUrl });
}
