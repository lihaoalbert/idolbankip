-- FACE_CLOSEUP 加进 IpFile.assetType enum
-- 上一条 migration (20260618000002) 漏了 ALTER enum (只加了列+FK), 结果 schema.prisma 写的 enum 值
-- MySQL 拒绝, 创作者上传面部特写返回 "Data truncated for column 'assetType'"
ALTER TABLE `IpFile` MODIFY COLUMN `assetType` ENUM('THREE_VIEW','EXPRESSION_GRID','TRANSPARENT_RENDER','LORA_FILE','RECIPE_TXT','TEST_SAMPLE','BIO_TXT','VOICE_REF','LEGAL_PROOF','PACKAGE_ZIP','FACE_CLOSEUP') NOT NULL;