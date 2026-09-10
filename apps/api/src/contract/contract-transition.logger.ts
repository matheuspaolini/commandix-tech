import { Injectable } from "@nestjs/common";
import { requestContext } from "../http";

@Injectable()
export class ContractTransitionLogger {
  activated(fields: Record<string, unknown>): void {
    this.write({ event: "contract.activated", ...fields });
  }

  rejected(fields: Record<string, unknown>): void {
    this.write({ event: "contract.activation_rejected", ...fields });
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
