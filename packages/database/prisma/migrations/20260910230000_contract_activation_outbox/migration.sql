ALTER TYPE "ContractHistoryAction" ADD VALUE 'ACTIVATED';
CREATE TYPE "OutboxFailureReason" AS ENUM (
  'RETURNED', 'NACKED', 'CONFIRM_TIMEOUT', 'CONNECTION_LOST'
);

CREATE TABLE "contract_activation_outbox" (
  "event_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "tenant_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "activation_revision" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMPTZ(6),
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
  "published_at" TIMESTAMPTZ(6),
  "failure_reason" "OutboxFailureReason",
  CONSTRAINT "contract_activation_outbox_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "contract_activation_outbox_event_type_check"
    CHECK ("event_type" = 'contract.activated'),
  CONSTRAINT "contract_activation_outbox_schema_version_check"
    CHECK ("schema_version" = 1),
  CONSTRAINT "contract_activation_outbox_activation_revision_check"
    CHECK ("activation_revision" > 0),
  CONSTRAINT "contract_activation_outbox_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "contract_activation_outbox_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_activation_outbox_contract_id_tenant_id_fkey"
    FOREIGN KEY ("contract_id", "tenant_id")
    REFERENCES "contracts"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "contract_activation_outbox_tenant_contract_revision_key"
  ON "contract_activation_outbox"("tenant_id", "contract_id", "activation_revision");
CREATE INDEX "contract_activation_outbox_due_idx"
  ON "contract_activation_outbox"("next_attempt_at", "occurred_at", "event_id")
  WHERE "published_at" IS NULL;

CREATE FUNCTION prevent_contract_activation_outbox_event_mutation()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    OLD."event_id", OLD."event_type", OLD."schema_version", OLD."tenant_id",
    OLD."contract_id", OLD."activation_revision", OLD."occurred_at", OLD."correlation_id"
  ) IS DISTINCT FROM ROW(
    NEW."event_id", NEW."event_type", NEW."schema_version", NEW."tenant_id",
    NEW."contract_id", NEW."activation_revision", NEW."occurred_at", NEW."correlation_id"
  ) THEN
    RAISE EXCEPTION 'Contract activation Outbox event identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_activation_outbox_event_immutable
  BEFORE UPDATE ON "contract_activation_outbox"
  FOR EACH ROW EXECUTE FUNCTION prevent_contract_activation_outbox_event_mutation();

REVOKE DELETE, TRUNCATE ON "contract_activation_outbox" FROM commandix_runtime;
