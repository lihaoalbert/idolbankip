-- #30.6.15 AI 图生成 (通义万相) — IpFile 加 2 字段
-- - isAiGenerated: 标记, 创作者二次修改时区分
-- - aiPrompt: 实际用的 prompt (审计 + 创作者参考重新生成)

ALTER TABLE `IpFile` ADD COLUMN `isAiGenerated` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `IpFile` ADD COLUMN `aiPrompt` TEXT NULL;
