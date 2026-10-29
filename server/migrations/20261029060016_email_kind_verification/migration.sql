-- AlterTable
ALTER TABLE `EmailMessage` MODIFY `kind` ENUM('task', 'reminder', 'escalation', 'digest', 'event', 'signature', 'verification') NOT NULL;
