-- DropIndex
DROP INDEX "Contact_workspaceId_instagramUserId_idx";

-- DropIndex
DROP INDEX "Conversation_contactId_idx";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_instagramUserId_key" ON "Contact"("workspaceId", "instagramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_contactId_channel_key" ON "Conversation"("contactId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");

