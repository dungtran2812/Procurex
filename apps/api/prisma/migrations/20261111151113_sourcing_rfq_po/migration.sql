-- CreateEnum
CREATE TYPE "rfq_status" AS ENUM ('OPEN', 'CLOSED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "po_status" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "erp_sync_status" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tax_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pr_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "status" "rfq_status" NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_invitations" (
    "id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "rfq_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotes" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "total_amount" DECIMAL(16,0) NOT NULL,
    "lead_time_days" INTEGER NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "lines" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "rfq_id" UUID NOT NULL,
    "pr_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "quote_id" UUID NOT NULL,
    "total_amount" DECIMAL(16,0) NOT NULL,
    "lines" JSONB NOT NULL,
    "status" "po_status" NOT NULL DEFAULT 'ISSUED',
    "erp_sync_status" "erp_sync_status" NOT NULL DEFAULT 'PENDING',
    "erp_ref" TEXT,
    "erp_attempts" INTEGER NOT NULL DEFAULT 0,
    "erp_last_error" TEXT,
    "issued_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "handler" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id","handler")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_email_key" ON "suppliers"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_pr_id_key" ON "rfqs"("pr_id");

-- CreateIndex
CREATE INDEX "rfqs_company_id_status_idx" ON "rfqs"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_invitations_token_hash_key" ON "rfq_invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_invitations_rfq_id_supplier_id_key" ON "rfq_invitations"("rfq_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quotes_invitation_id_key" ON "supplier_quotes"("invitation_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_rfq_id_key" ON "purchase_orders"("rfq_id");

-- CreateIndex
CREATE INDEX "purchase_orders_company_id_created_at_idx" ON "purchase_orders"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- AddForeignKey
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "rfq_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
