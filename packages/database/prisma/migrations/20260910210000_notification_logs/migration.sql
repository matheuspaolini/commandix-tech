CREATE TABLE "notification_logs" (
  "event_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "tenant_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "activation_revision" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "notification_logs_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "notification_logs_activation_revision_check" CHECK ("activation_revision" > 0),
  CONSTRAINT "notification_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notification_logs_contract_id_tenant_id_fkey"
    FOREIGN KEY ("contract_id", "tenant_id") REFERENCES "contracts"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "notification_logs_tenant_id_contract_id_idx"
  ON "notification_logs"("tenant_id", "contract_id");
