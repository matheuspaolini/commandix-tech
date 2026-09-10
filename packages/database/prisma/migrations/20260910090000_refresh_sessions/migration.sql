CREATE TABLE "refresh_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refresh_sessions_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

CREATE TABLE "refresh_credentials" (
  "selector" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "parent_id" UUID,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "refresh_credentials_pkey" PRIMARY KEY ("selector"),
  CONSTRAINT "refresh_credentials_generation_check" CHECK ("generation" >= 0),
  CONSTRAINT "refresh_credentials_consumed_check" CHECK ("consumed_at" IS NULL OR "consumed_at" >= "issued_at"),
  CONSTRAINT "refresh_credentials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "refresh_sessions"("id") ON DELETE RESTRICT,
  CONSTRAINT "refresh_credentials_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "refresh_credentials"("selector") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "refresh_credentials_parent_id_key" ON "refresh_credentials"("parent_id");
CREATE UNIQUE INDEX "refresh_credentials_session_id_generation_key" ON "refresh_credentials"("session_id", "generation");
CREATE INDEX "refresh_credentials_session_id_idx" ON "refresh_credentials"("session_id");
