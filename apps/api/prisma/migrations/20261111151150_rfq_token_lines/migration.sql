/*
  Warnings:

  - Added the required column `lines` to the `rfqs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "rfq_invitations" ALTER COLUMN "token_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "rfqs" ADD COLUMN     "lines" JSONB NOT NULL;
