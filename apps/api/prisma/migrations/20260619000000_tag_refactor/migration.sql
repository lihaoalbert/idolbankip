-- #32 标签体系重设计 — 脸特征为核心
-- 1) gender String → Gender enum
-- 2) visualAgeBucket String → AgeBucket enum + rename to ageBucket
-- 3) 新增 ethnicity Ethnicity? (历史 NULL, UI 提示创作者补)
-- 4) 新增 faceTags Json? (脸特征多选)
-- 5) 索引替换: (gender, visualAgeBucket) → (gender, ageBucket, ethnicity)
--
-- 关键设计决策 (经 Plan agent 验证):
-- - MySQL 8 RENAME COLUMN 是 metadata-only, 与 MODIFY ENUM 顺序无关
-- - MODIFY ENUM 之前必须 UPPER + 'old'→'ELDERLY', 否则 "Data truncated"
-- - ethnicity 不回填 (留 NULL), 避免污染覆盖度统计 — 让创作者在 UI 补

-- Step 1: 新增 nullable 列
ALTER TABLE `IpAsset` ADD COLUMN `ethnicity` ENUM('EAST_ASIAN','SOUTHEAST_ASIAN','SOUTH_ASIAN','AFRICAN','EUROPEAN','MIXED') NULL;
ALTER TABLE `IpAsset` ADD COLUMN `faceTags` JSON NULL;

-- Step 2: 数据归一化 (小写 → 大写, 缩写 → 全名, YOUNG_ADULT → YOUNG)
UPDATE `IpAsset` SET `gender` = UPPER(`gender`);
-- 单字母缩写补全 (历史测试遗留)
UPDATE `IpAsset` SET `gender` = 'FEMALE' WHERE `gender` = 'F';
UPDATE `IpAsset` SET `gender` = 'MALE'   WHERE `gender` = 'M';
UPDATE `IpAsset` SET `visualAgeBucket` = CASE
  WHEN `visualAgeBucket` IN ('old', 'OLD') THEN 'ELDERLY'
  WHEN `visualAgeBucket` IN ('y', 'Y', 'young_adult', 'YOUNG_ADULT') THEN 'YOUNG'
  ELSE UPPER(`visualAgeBucket`)
END;

-- Step 3: 装 enum 约束 (NOT NULL 因为 schema 列上无 '?')
ALTER TABLE `IpAsset` MODIFY COLUMN `gender` ENUM('MALE','FEMALE','NONBINARY') NOT NULL;
ALTER TABLE `IpAsset` MODIFY COLUMN `visualAgeBucket` ENUM('CHILD','YOUNG','MIDDLE','ELDERLY') NOT NULL;

-- Step 4: 列改名 (MySQL 8 RENAME COLUMN 是 metadata-only, 安全)
ALTER TABLE `IpAsset` RENAME COLUMN `visualAgeBucket` TO `ageBucket`;

-- Step 5: 索引替换 (Prisma 生成的索引名是 <Table>_<col1>_<col2>_idx)
ALTER TABLE `IpAsset` DROP INDEX `IpAsset_gender_visualAgeBucket_idx`;
CREATE INDEX `IpAsset_gender_ageBucket_ethnicity_idx` ON `IpAsset`(`gender`, `ageBucket`, `ethnicity`);