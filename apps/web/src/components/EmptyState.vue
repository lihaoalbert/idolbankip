<script setup lang="ts">
/**
 * 空状态 — 6 个列表页 (我的订单 / 我的资产 / 形象库 / 审核队列 / 用户 / KYC) 共用
 *
 * 视觉: 64px 圆形灰色底 + emoji/字符, 标题 + 副标题, 可选 CTA
 */
withDefaults(defineProps<{
  /** emoji 或 1-2 字符 (避免使用 emoji 时可传入 "📭" 之类的空槽) */
  icon?: string;
  title: string;
  description?: string;
  /** CTA 按钮文字 + 跳转, 两者都传才显示 */
  actionLabel?: string;
  actionTo?: string;
  /** 触发的 click 事件 (用于非路由 CTA) */
  actionOnClick?: () => void;
  /** 紧凑模式: 用在卡片内, 减少 padding */
  compact?: boolean;
}>(), {
  icon: '📭',
  compact: false,
});
</script>

<template>
  <div
    :class="[
      'text-center',
      compact ? 'py-8 px-4' : 'py-20 px-6',
    ]"
  >
    <div
      :class="[
        'mx-auto rounded-full bg-line/50 flex items-center justify-center mb-4',
        compact ? 'w-12 h-12 text-2xl' : 'w-20 h-20 text-4xl',
      ]"
    >
      <span>{{ icon }}</span>
    </div>
    <h3 :class="['font-medium text-ink mb-1', compact ? 'text-sm' : 'text-base']">
      {{ title }}
    </h3>
    <p
      v-if="description"
      :class="['text-ink/50 max-w-sm mx-auto', compact ? 'text-xs' : 'text-sm']"
    >
      {{ description }}
    </p>
    <RouterLink
      v-if="actionTo"
      :to="actionTo"
      :class="[
        'inline-block mt-4 text-gold hover:text-ink transition',
        compact ? 'text-xs' : 'text-sm',
      ]"
    >
      {{ actionLabel }} →
    </RouterLink>
    <button
      v-else-if="actionOnClick"
      @click="actionOnClick"
      type="button"
      :class="[
        'inline-block mt-4 text-gold hover:text-ink transition',
        compact ? 'text-xs' : 'text-sm',
      ]"
    >
      {{ actionLabel }} →
    </button>
  </div>
</template>
