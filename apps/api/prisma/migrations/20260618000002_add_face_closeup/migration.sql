-- 面部特写字段 — 版权登记核心证据
-- 1) IpAsset 加 faceCloseupFileId 列 (nullable, 唯一)
-- 2) 存量数据:对每个无 faceCloseupFileId 的 IP,取其第一张 THREE_VIEW 填入 (UI 标"占位中",可后补)
-- 3) FK 到 IpFile (ON DELETE SET NULL: 删 file 不级联删 IP,只是解除版权图指针)

-- 1. 加列 (无 unique,先允许 backfill)
ALTER TABLE `IpAsset` ADD COLUMN `faceCloseupFileId` VARCHAR(191) NULL;

-- 2. 存量数据 backfill:每 IP 取 uploadedAt 最早的那张 THREE_VIEW
-- MySQL 8.0+ 支持 UPDATE...JOIN,使用窗口函数给每 IP 的 THREE_VIEW 排序
UPDATE `IpAsset` AS `i`
LEFT JOIN (
  SELECT `ipId`, `id` AS `fileId`,
         ROW_NUMBER() OVER (PARTITION BY `ipId` ORDER BY `uploadedAt` ASC, `id` ASC) AS `rn`
  FROM `IpFile`
  WHERE `assetType` = 'THREE_VIEW'
) AS `first_three`
  ON `first_three`.`ipId` = `i`.`id` AND `first_three`.`rn` = 1
SET `i`.`faceCloseupFileId` = `first_three`.`fileId`
WHERE `i`.`faceCloseupFileId` IS NULL;

-- 3. 唯一索引 (rows 已 backfill, 加 unique 安全)
CREATE UNIQUE INDEX `IpAsset_faceCloseupFileId_key` ON `IpAsset`(`faceCloseupFileId`);

-- 4. 外键
ALTER TABLE `IpAsset` ADD CONSTRAINT `IpAsset_faceCloseupFileId_fkey`
  FOREIGN KEY (`faceCloseupFileId`) REFERENCES `IpFile`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
