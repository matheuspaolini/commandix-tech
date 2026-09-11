import { Injectable } from "@nestjs/common";
import { requestContext } from "@/http";

@Injectable()
export class ContractTransitionLogger {
  activated(fields: Record<string, unknown>): void {
    this.write({ event: "contract.activated", ...fields });
  }

  closed(fields: Record<string, unknown>): void {
    this.write({ event: "contract.closed", ...fields });
  }

  rejected(fields: Record<string, unknown>): void {
    this.write({ event: "contract.activation_rejected", ...fields });
  }

  closureRejected(fields: Record<string, unknown>): void {
    this.write({ event: "contract.closure_rejected", ...fields });
  }

  edited(fields: Record<string, unknown>): void {
    this.write({ event: "contract.edited", ...fields });
  }

  unchanged(fields: Record<string, unknown>): void {
    this.write({ event: "contract.edit_unchanged", ...fields });
  }

  editRejected(fields: Record<string, unknown>): void {
    this.write({ event: "contract.edit_rejected", ...fields });
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
