-- CreateTable
CREATE TABLE `Region` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Institution` (
    `id` VARCHAR(32) NOT NULL,
    `legalName` VARCHAR(200) NOT NULL,
    `shortCode` VARCHAR(6) NOT NULL,
    `type` ENUM('university', 'college', 'school') NOT NULL,
    `legalStatus` VARCHAR(200) NOT NULL,
    `registeredAddress` VARCHAR(500) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `regionId` VARCHAR(32) NOT NULL,
    `group` VARCHAR(40) NULL,
    `jurisdictionCourt` VARCHAR(200) NOT NULL,
    `arbitrationSeat` VARCHAR(120) NOT NULL,
    `signatoryName` VARCHAR(120) NOT NULL,
    `signatoryDesignation` VARCHAR(120) NOT NULL,
    `coordinatorName` VARCHAR(120) NOT NULL,
    `programmeGroups` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Institution_shortCode_key`(`shortCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(40) NOT NULL,
    `institutionId` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `city` VARCHAR(80) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `Location_institutionId_sortOrder_idx`(`institutionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserInstitution` (
    `userId` VARCHAR(32) NOT NULL,
    `institutionId` VARCHAR(32) NOT NULL,

    INDEX `UserInstitution_institutionId_idx`(`institutionId`),
    PRIMARY KEY (`userId`, `institutionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoutingRule` (
    `id` VARCHAR(32) NOT NULL,
    `institutionId` VARCHAR(32) NOT NULL,
    `condition` ENUM('standard', 'non_standard') NOT NULL,
    `approverId` VARCHAR(32) NOT NULL,
    `escalateToId` VARCHAR(32) NOT NULL,

    UNIQUE INDEX `RoutingRule_institutionId_condition_key`(`institutionId`, `condition`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `sla` JSON NOT NULL,
    `allowedDomains` JSON NOT NULL,
    `masterLists` JSON NOT NULL,
    `lastDigestDate` CHAR(10) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateCard` (
    `id` VARCHAR(40) NOT NULL,
    `institutionId` VARCHAR(32) NOT NULL,
    `version` INTEGER NOT NULL,
    `effectiveFrom` CHAR(10) NOT NULL,
    `status` ENUM('draft', 'pending_approval', 'approved', 'published', 'retired') NOT NULL,
    `applyMode` ENUM('new_only', 'addendums') NOT NULL,
    `rows` JSON NOT NULL,
    `extras` JSON NOT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedById` VARCHAR(32) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectComment` TEXT NULL,
    `publishedById` VARCHAR(32) NULL,
    `publishedAt` DATETIME(3) NULL,
    `affectedAgreementIds` JSON NULL,

    INDEX `RateCard_institutionId_status_idx`(`institutionId`, `status`),
    UNIQUE INDEX `RateCard_institutionId_version_key`(`institutionId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateVersion` (
    `id` VARCHAR(40) NOT NULL,
    `institutionId` VARCHAR(32) NULL,
    `cpType` ENUM('individual', 'sole_prop', 'proprietorship', 'partnership', 'pvt_ltd') NOT NULL,
    `version` INTEGER NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `blobKey` VARCHAR(255) NULL,
    `effectiveFrom` CHAR(10) NOT NULL,
    `status` ENUM('draft', 'pending_approval', 'approved', 'published', 'retired') NOT NULL,
    `changeNote` TEXT NOT NULL,
    `uploadedById` VARCHAR(32) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvedById` VARCHAR(32) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectComment` TEXT NULL,
    `publishedById` VARCHAR(32) NULL,
    `publishedAt` DATETIME(3) NULL,
    `content` JSON NULL,
    `sourceDocumentId` VARCHAR(32) NULL,

    INDEX `TemplateVersion_cpType_institutionId_status_idx`(`cpType`, `institutionId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Institution` ADD CONSTRAINT `Institution_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInstitution` ADD CONSTRAINT `UserInstitution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserInstitution` ADD CONSTRAINT `UserInstitution_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoutingRule` ADD CONSTRAINT `RoutingRule_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateCard` ADD CONSTRAINT `RateCard_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateVersion` ADD CONSTRAINT `TemplateVersion_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
