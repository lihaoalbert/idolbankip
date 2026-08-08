/**
 * #30.7.1 W2 #31 实时倒计时 composable
 * 用法:
 *   const { days, hours, minutes, totalMs, expired, label } = useCountdown(() => brief.value?.deadlineAt);
 *   setInterval 每分钟更新;组件卸载自动停止。
 *
 * - 过期 → expired=true,label = "已截止"
 * - ≤3 天 → variant=danger (红)
 * - 否则 → variant=normal
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export type CountdownVariant = 'normal' | 'danger' | 'expired';

export function useCountdown(deadlineGetter: () => string | null | undefined) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 60_000);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  const totalMs = computed(() => {
    const d = deadlineGetter();
    if (!d) return 0;
    return new Date(d).getTime() - now.value;
  });

  const expired = computed(() => totalMs.value < 0);

  const days = computed(() => Math.floor(totalMs.value / (24 * 3600 * 1000)));
  const hours = computed(() => Math.floor((totalMs.value % (24 * 3600 * 1000)) / (3600 * 1000)));
  const minutes = computed(() => Math.floor((totalMs.value % (3600 * 1000)) / 60_000));

  const variant = computed<CountdownVariant>(() => {
    if (expired.value) return 'expired';
    if (totalMs.value <= 3 * 24 * 3600 * 1000) return 'danger';
    return 'normal';
  });

  const label = computed(() => {
    if (expired.value) return 'EXPIRED · 已截止';
    if (days.value > 0) return `${days.value} 天 ${hours.value} 时`;
    if (hours.value > 0) return `${hours.value} 时 ${minutes.value} 分`;
    return `${minutes.value} 分`;
  });

  return { days, hours, minutes, totalMs, expired, variant, label };
}