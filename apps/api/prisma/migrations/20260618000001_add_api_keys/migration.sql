-- Agent API Key 表 — 创作者为 n8n / CLI / 第三方生成 long-lived key
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `scopes` VARCHAR(191) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
    INDEX `ApiKey_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- User 端反查
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
