import { Injectable } from "@nestjs/common";
import { requestContext } from "@/http";
import type { CreatedContract } from "@/contract/application/create-contract/create-contract";

@Injectable()
export class ContractCreationLogger {
  created(tenantId: string, actorId: string, contract: CreatedContract): void {
    this.write({
      event: "contract.created",
      tenantId,
      actorId,
      contractId: contract.id,
      templateVersionId: contract.templateVersionId,
      revision: contract.revision,
    });
  }

  rejected(tenantId: string, actorId: string, reason: string): void {
    this.write({
      event: "contract.creation_rejected",
      tenantId,
      actorId,
      reason,
    });
  }

  private write(fields: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        ...fields,
        correlationId: requestContext.correlationId(),
      }),
    );
  }
}
