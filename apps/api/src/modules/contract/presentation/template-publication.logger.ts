import { Injectable } from "@nestjs/common";

import { requestContext } from "@/platform/http";

@Injectable()
export class TemplatePublicationLogger {
  created(fields: Record<string, unknown>): void {
    this.write({ event: "template.created", ...fields });
  }

  published(fields: Record<string, unknown>): void {
    this.write({ event: "template.published", ...fields });
  }

  unchanged(fields: Record<string, unknown>): void {
    this.write({ event: "template.unchanged", ...fields });
  }

  rejected(fields: Record<string, unknown>): void {
    this.write({ event: "template.publication_rejected", ...fields });
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
