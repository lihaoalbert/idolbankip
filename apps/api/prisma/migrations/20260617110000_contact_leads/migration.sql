-- 商务留资表
CREATE TABLE `ContactLead` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `company` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `wechat` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `message` TEXT NOT NULL,
  `source` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ContactLead_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
