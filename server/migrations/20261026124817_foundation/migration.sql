-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `designation` VARCHAR(120) NOT NULL,
    `regionId` VARCHAR(32) NOT NULL,
    `managerId` VARCHAR(32) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` VARCHAR(32) NOT NULL,
    `role` ENUM('bd_exec', 'legal', 'admin') NOT NULL,

    INDEX `UserRole_role_idx`(`role`),
    PRIMARY KEY (`userId`, `role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `key` VARCHAR(64) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(32) NOT NULL,
    `actorName` VARCHAR(120) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(64) NOT NULL,
    `summary` TEXT NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(64) NOT NULL,
    `device` VARCHAR(80) NOT NULL,

    INDEX `AuditEvent_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditEvent_actorId_at_idx`(`actorId`, `at`),
    INDEX `AuditEvent_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(32) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `agreementId` VARCHAR(64) NULL,
    `cpId` VARCHAR(32) NULL,
    `refId` VARCHAR(64) NULL,
    `institutionId` VARCHAR(32) NULL,
    `assigneeId` VARCHAR(32) NOT NULL,
    `dueDate` CHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('open', 'done', 'cancelled') NOT NULL DEFAULT 'open',
    `completedAt` DATETIME(3) NULL,
    `completedById` VARCHAR(32) NULL,
    `remindedAt` DATETIME(3) NULL,
    `escalatedToId` VARCHAR(32) NULL,
    `escalatedAt` DATETIME(3) NULL,

    INDEX `Task_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `Task_agreementId_status_idx`(`agreementId`, `status`),
    INDEX `Task_refId_idx`(`refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `read` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Notification_userId_read_idx`(`userId`, `read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailMessage` (
    `id` VARCHAR(32) NOT NULL,
    `to` VARCHAR(254) NOT NULL,
    `subject` VARCHAR(300) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(500) NULL,
    `kind` ENUM('task', 'reminder', 'escalation', 'digest', 'event', 'signature') NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('sending', 'sent', 'failed') NULL,
    `providerId` VARCHAR(100) NULL,
    `error` VARCHAR(500) NULL,

    INDEX `EmailMessage_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
