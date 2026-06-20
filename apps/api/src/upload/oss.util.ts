/**
 * OSS URL 拼装工具 — 避免 UploadService ↔ HonorService 循环依赖
 *
 * public 桶 URL 格式: https://{bucket}.{region}.aliyuncs.com/{key}
 * 公开图(缩略图/封面)用 public 桶直链, 无需签名。
 */
export function publicOssUrl(bucket: string, region: string, key: string): string {
  return `https://${bucket}.${region}.aliyuncs.com/${key}`;
}