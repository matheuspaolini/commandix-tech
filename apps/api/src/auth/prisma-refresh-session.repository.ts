import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../database";
import { constantWorkEqual } from "./refresh-session.security";
import type {
  CreateRefreshSession,
  CreatedRefreshSession,
  RefreshSessionRepository,
  RevocationResult,
  RevokeRefreshSession,
  RotateRefreshSession,
  RotationResult,
} from "./refresh-session.repository";

@Injectable()
export class PrismaRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateRefreshSession): Promise<CreatedRefreshSession> {
    const session = await this.database.client.refreshSession.create({
      data: {
        userId: input.userId,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        credentials: {
          create: {
            selector: input.credential.selector,
            secretHash: input.credential.secretHash,
            generation: 0,
            issuedAt: input.createdAt,
          },
        },
      },
      select: { id: true },
    });

    return { sessionId: session.id };
  }

  async rotate(input: RotateRefreshSession): Promise<RotationResult> {
    return this.database.client.$transaction(async (transaction) => {
      const located = await transaction.refreshCredential.findUnique({
        where: { selector: input.presented.selector },
        select: { sessionId: true },
      });
      if (!located) return { outcome: "invalid" };

      await transaction.$queryRaw`
        SELECT id FROM refresh_sessions
        WHERE id = ${located.sessionId}::uuid
        FOR UPDATE
      `;

      const current = await transaction.refreshCredential.findUnique({
        where: { selector: input.presented.selector },
        include: { session: { include: { user: true } } },
      });
      if (!current) return { outcome: "invalid" };
      if (!constantWorkEqual(input.presented.secretHash, current.secretHash)) {
        return { outcome: "invalid" };
      }
      if (current.session.revokedAt || input.now >= current.session.expiresAt) {
        return { outcome: "invalid" };
      }

      if (current.consumedAt) {
        await transaction.refreshSession.update({
          where: { id: current.sessionId },
          data: { revokedAt: input.now },
        });
        return { outcome: "reused", sessionId: current.sessionId };
      }

      await transaction.refreshCredential.update({
        where: { selector: current.selector },
        data: { consumedAt: input.now },
      });
      await transaction.refreshCredential.create({
        data: {
          selector: input.replacement.selector,
          secretHash: input.replacement.secretHash,
          sessionId: current.sessionId,
          generation: current.generation + 1,
          parentId: current.selector,
          issuedAt: input.now,
        },
      });

      return {
        outcome: "rotated",
        sessionId: current.sessionId,
        expiresAt: current.session.expiresAt,
        subject: {
          userId: current.session.user.id,
          tenantId: current.session.user.tenantId,
          role: current.session.user.role,
        },
      };
    });
  }

  async revoke(input: RevokeRefreshSession): Promise<RevocationResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const located = await transaction.refreshCredential.findUnique({
        where: { selector: input.presented.selector },
        select: { sessionId: true },
      });
      if (!located) return null;

      await transaction.$queryRaw`
        SELECT id FROM refresh_sessions
        WHERE id = ${located.sessionId}::uuid
        FOR UPDATE
      `;
      const credential = await transaction.refreshCredential.findUnique({
        where: { selector: input.presented.selector },
        include: { session: true },
      });
      if (!credential) return null;
      if (
        !constantWorkEqual(input.presented.secretHash, credential.secretHash)
      ) {
        return null;
      }
      const revokedNow = !credential.session.revokedAt;
      if (revokedNow) {
        await transaction.refreshSession.update({
          where: { id: credential.sessionId },
          data: { revokedAt: input.now },
        });
      }
      return { sessionId: credential.sessionId, revokedNow };
    });
  }
}
