CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "ContractHistoryAction" AS ENUM ('CREATED');

CREATE UNIQUE INDEX "template_versions_id_tenant_id_key"
  ON "template_versions"("id", "tenant_id");
CREATE UNIQUE INDEX "users_id_tenant_id_key"
  ON "users"("id", "tenant_id");

CREATE TABLE "contracts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "status" "ContractStatus" NOT NULL,
  "revision" INTEGER NOT NULL,
  "values" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contracts_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contracts_template_version_id_tenant_id_fkey"
    FOREIGN KEY ("template_version_id", "tenant_id")
    REFERENCES "template_versions"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "contracts_id_tenant_id_key" ON "contracts"("id", "tenant_id");
CREATE INDEX "contracts_tenant_id_created_at_idx" ON "contracts"("tenant_id", "created_at");

CREATE TABLE "contract_history" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "contract_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "action" "ContractHistoryAction" NOT NULL,
  "revision" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "before_snapshot" JSONB,
  "after_snapshot" JSONB NOT NULL,
  CONSTRAINT "contract_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_history_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "contract_history_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contract_history_contract_id_tenant_id_fkey"
    FOREIGN KEY ("contract_id", "tenant_id") REFERENCES "contracts"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "contract_history_actor_id_tenant_id_fkey"
    FOREIGN KEY ("actor_id", "tenant_id") REFERENCES "users"("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "contract_history_tenant_id_contract_id_revision_key"
  ON "contract_history"("tenant_id", "contract_id", "revision");
CREATE INDEX "contract_history_tenant_id_contract_id_revision_idx"
  ON "contract_history"("tenant_id", "contract_id", "revision");

CREATE FUNCTION prevent_contract_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Contract history is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER contract_history_rows_immutable
  BEFORE UPDATE OR DELETE ON "contract_history"
  FOR EACH ROW EXECUTE FUNCTION prevent_contract_history_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON "contract_history" FROM commandix_runtime;
