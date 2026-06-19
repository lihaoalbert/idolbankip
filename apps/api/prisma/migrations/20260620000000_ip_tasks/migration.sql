-- #30 任务发布 / 创作者接单
-- 新增 IpTask + IpTaskAccept + IpOrigin enum
-- IpAsset 加 origin (默认 SELF) + taskId (FK → IpTask, ON DELETE SET NULL)

-- 1. 新 enum
ALTER TABLE `IpAsset` ADD COLUMN `origin` ENUM('SELF','TASK') NOT NULL DEFAULT 'SELF';
ALTER TABLE `IpAsset` ADD COLUMN `taskId` VARCHAR(191) NULL;

-- 2. 新表 IpTask
CREATE TABLE `IpTask` (
  `id`          VARCHAR(191) NOT NULL,
  `title`       VARCHAR(191) NOT NULL,
  `description` TEXT         NOT NULL,
  `spec`        JSON         NOT NULL,
  `budgetFen`   INT          NOT NULL,
  `perIpFen`    INT          NULL,
  `maxAccepts`  INT          NOT NULL DEFAULT 10,
  `deadlineAt`  DATETIME(3)  NOT NULL,
  `status`      ENUM('OPEN','CLOSED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL,
  `closedAt`    DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  INDEX `IpTask_status_deadlineAt_idx`(`status`, `deadlineAt`),
  INDEX `IpTask_createdById_idx`(`createdById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 新表 IpTaskAccept
CREATE TABLE `IpTaskAccept` (
  `id`             VARCHAR(191) NOT NULL,
  `taskId`         VARCHAR(191) NOT NULL,
  `creatorId`      VARCHAR(191) NOT NULL,
  `acceptedAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `submittedCount` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IpTaskAccept_taskId_creatorId_key`(`taskId`, `creatorId`),
  INDEX `IpTaskAccept_creatorId_idx`(`creatorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. FK IpAsset.taskId → IpTask.id (ON DELETE SET NULL — 任务删了 IP 不删, 只是脱钩)
ALTER TABLE `IpAsset` ADD CONSTRAINT `IpAsset_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `IpTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. FK IpTaskAccept.taskId → IpTask.id (ON DELETE CASCADE — 任务删了接单记录一起删)
ALTER TABLE `IpTaskAccept` ADD CONSTRAINT `IpTaskAccept_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `IpTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
