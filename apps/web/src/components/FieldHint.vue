<script setup lang="ts">
/**
 * #30.6 FieldHint — 字段下挂的提示组件
 *
 * 用法:
 *   <FieldHint field="description" />
 *   <FieldHint :field-meta="ipWizardFields.description" />
 */
import { computed, ref } from 'vue';
import { ipWizardFields, adminTaskFields, type FieldMeta } from '@/lib/fieldMeta';

const props = defineProps<{
  field?: keyof typeof ipWizardFields | keyof typeof adminTaskFields;
  fieldMeta?: FieldMeta;
}>();

const meta = computed<FieldMeta | undefined>(() => {
  if (props.fieldMeta) return props.fieldMeta;
  if (!props.field) return undefined;
  return ipWizardFields[props.field] || adminTaskFields[props.field];
});

const expanded = ref(false);
</script>

<template>
  <div v-if="meta" class="mt-1">
    <p class="text-[11px] text-ink/50 leading-relaxed">{{ meta.description }}</p>
    <button
      v-if="meta.examples.length > 0"
      type="button"
      @click="expanded = !expanded"
      class="text-[10px] text-gold/70 hover:text-gold mt-0.5"
    >{{ expanded ? '收起示例 ▴' : `看 ${meta.examples.length} 个示例 ▾` }}</button>
    <ul v-if="expanded && meta.examples.length > 0" class="mt-1 space-y-1">
      <li
        v-for="(ex, i) in meta.examples"
        :key="i"
        class="text-[11px] text-ink/60 bg-cream/50 px-2 py-1 rounded leading-relaxed"
      >{{ ex }}</li>
    </ul>
  </div>
</template>