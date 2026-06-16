-- Migration: multi_role_users
-- 把 User.role (enum) 重命名为 User.roles (JSON 数组), 支持一个用户同时持有
-- 多个角色 (CREATOR + BUYER, 后台再加 ADMIN)。原 enum 在 MySQL 里随列 drop 自动消失。

-- 1. 新增 JSON 列
ALTER TABLE `User` ADD COLUMN `roles` JSON NULL;

-- 2. 数据迁移: 单值 enum -> 单元素 JSON 数组
UPDATE `User` SET `roles` = JSON_ARRAY(`role`);

-- 3. 删旧列 (MySQL enum 约束随列 drop)
ALTER TABLE `User` DROP COLUMN `role`;

-- 4. 删 role 索引
DROP INDEX `User_role_idx` ON `User`;
