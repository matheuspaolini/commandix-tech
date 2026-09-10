CREATE TABLE "logical_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "active_version_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logical_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logical_templates_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "template_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "logical_template_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "definition" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "logical_templates_tenant_id_key"
  ON "logical_templates"("tenant_id");
CREATE UNIQUE INDEX "logical_templates_active_version_id_key"
  ON "logical_templates"("active_version_id");
CREATE UNIQUE INDEX "logical_templates_id_tenant_id_key"
  ON "logical_templates"("id", "tenant_id");
CREATE UNIQUE INDEX "logical_templates_active_version_id_id_tenant_id_key"
  ON "logical_templates"("active_version_id", "id", "tenant_id");
CREATE UNIQUE INDEX "template_versions_id_logical_template_id_tenant_id_key"
  ON "template_versions"("id", "logical_template_id", "tenant_id");
CREATE INDEX "template_versions_logical_template_id_tenant_id_idx"
  ON "template_versions"("logical_template_id", "tenant_id");

ALTER TABLE "logical_templates"
  ADD CONSTRAINT "logical_templates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "template_versions"
  ADD CONSTRAINT "template_versions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "template_versions"
  ADD CONSTRAINT "template_versions_logical_template_id_tenant_id_fkey"
  FOREIGN KEY ("logical_template_id", "tenant_id")
  REFERENCES "logical_templates"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "logical_templates"
  ADD CONSTRAINT "logical_templates_active_version_id_id_tenant_id_fkey"
  FOREIGN KEY ("active_version_id", "id", "tenant_id")
  REFERENCES "template_versions"("id", "logical_template_id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION prevent_template_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Template versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER template_versions_immutable
  BEFORE UPDATE OR DELETE ON "template_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_template_version_mutation();

REVOKE UPDATE, DELETE ON "template_versions" FROM commandix_runtime;
