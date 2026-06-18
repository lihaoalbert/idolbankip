-- #33 创作过程证据附件 (PROCESS_EVIDENCE)
-- 1) AssetType enum 加 PROCESS_EVIDENCE
-- 2) IpFile.description String?  (创作者自由文本: "SD WebUI 训练 loss 曲线", "ComfyUI 工作流", "Midjourney 出图序列" 等)
-- 3) IpFile.processStep String? (后端 const list 约束: TRAINING_DATA_PREP / TRAINING / GENERATION / POST_PROCESSING / OTHER)
--    选 String 而非 enum 是为了让产品能加新 step 无需 migration
--
-- 限额 (后端 ASSET_LIMITS 同步):
--   - 单文件 ≤ 200MB
--   - 单 IP 累计 ≤ 600MB
-- 上限是产品决策: 一般 SD/Comfy 工作流截图 + 训练 loss 图 + 几段短视频总和就够, 上限 600MB 阻止滥用

-- Step 1: enum 扩展
ALTER TABLE `IpFile` MODIFY COLUMN `assetType` ENUM(
  'THREE_VIEW',
  'EXPRESSION_GRID',
  'TRANSPARENT_RENDER',
  'LORA_FILE',
  'RECIPE_TXT',
  'TEST_SAMPLE',
  'BIO_TXT',
  'VOICE_REF',
  'LEGAL_PROOF',
  'PACKAGE_ZIP',
  'FACE_CLOSEUP',
  'PROCESS_EVIDENCE'
) NOT NULL;

-- Step 2: 新增 description + processStep (nullable, 老数据为 NULL)
ALTER TABLE `IpFile` ADD COLUMN `description`  TEXT NULL;
ALTER TABLE `IpFile` ADD COLUMN `processStep` VARCHAR(64) NULL;

-- Step 3: 索引 (高频 query: 查某 IP 的所有证据)
CREATE INDEX `IpFile_ipId_assetType_idx` ON `IpFile`(`ipId`, `assetType`);
