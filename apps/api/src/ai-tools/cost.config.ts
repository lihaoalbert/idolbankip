/**
 * W3 W2 D3 — AI 工具成本估算配置
 *
 * 单价表(costCents / 单位):
 *   sora:    ¥0.50/秒视频   (基于 OpenAI 公开定价)
 *   kling:   ¥0.30/秒视频   (可灵公开档位)
 *   jimeng:  ¥0.20/秒视频   (即梦)
 *   runway:  ¥0.60/秒视频   (Runway Gen-3)
 *
 * 真实单价上线前会从 admin/settings/llm 配置覆盖;
 * 当前 mock 阶段用静态常量,前端可展示"预估成本"。
 */
export interface ToolCostConfig {
  toolName: string;
  label: string;
  unit: 'second' | 'image';
  unitCostCents: number;
  /** 默认调用时长(秒)— UI 估算时无明确参数时使用 */
  defaultDurationSec: number;
  /** 支持的输出类型 */
  outputType: 'video' | 'image';
  /** 模拟生成耗时(毫秒)— 给前端 loading 提示 */
  mockDurationMs: number;
  /** 默认分辨率 */
  defaultResolution: string;
}

export const TOOL_COST_CONFIG: Record<string, ToolCostConfig> = {
  sora: {
    toolName: 'sora',
    label: 'Sora (OpenAI)',
    unit: 'second',
    unitCostCents: 50, // ¥0.50/秒
    defaultDurationSec: 8,
    outputType: 'video',
    mockDurationMs: 4500,
    defaultResolution: '1920x1080',
  },
  kling: {
    toolName: 'kling',
    label: '可灵 (快手)',
    unit: 'second',
    unitCostCents: 30,
    defaultDurationSec: 10,
    outputType: 'video',
    mockDurationMs: 3200,
    defaultResolution: '1080x1920',
  },
  jimeng: {
    toolName: 'jimeng',
    label: '即梦 (字节)',
    unit: 'second',
    unitCostCents: 20,
    defaultDurationSec: 10,
    outputType: 'video',
    mockDurationMs: 2800,
    defaultResolution: '1080x1920',
  },
  runway: {
    toolName: 'runway',
    label: 'Runway Gen-3',
    unit: 'second',
    unitCostCents: 60,
    defaultDurationSec: 8,
    outputType: 'video',
    mockDurationMs: 5200,
    defaultResolution: '1920x1080',
  },
};

export const SUPPORTED_TOOLS = Object.keys(TOOL_COST_CONFIG);

export function getToolConfig(toolName: string): ToolCostConfig | null {
  return TOOL_COST_CONFIG[toolName] ?? null;
}

/**
 * 根据工具 + 调用参数估算成本(cents)
 * 公开导出,D3 前端实时成本条用
 */
export function estimateCost(
  toolName: string,
  params: { durationSec?: number; imageCount?: number } = {},
): { costCents: number; unit: string; durationSec: number; imageCount: number } {
  const cfg = getToolConfig(toolName);
  if (!cfg) {
    return { costCents: 0, unit: 'unknown', durationSec: 0, imageCount: 0 };
  }
  if (cfg.unit === 'second') {
    const dur = params.durationSec ?? cfg.defaultDurationSec;
    return {
      costCents: Math.round(cfg.unitCostCents * dur),
      unit: cfg.unit,
      durationSec: dur,
      imageCount: 0,
    };
  }
  const count = params.imageCount ?? 1;
  return {
    costCents: cfg.unitCostCents * count,
    unit: cfg.unit,
    durationSec: 0,
    imageCount: count,
  };
}

/**
 * 估算整个 toolchain 的"满配成本"(每个 tool 都用默认时长调一次)
 */
export function estimateToolchainFull(
  toolchain: Record<string, boolean>,
): { items: Array<{ toolName: string; costCents: number }>; totalCents: number } {
  const items: Array<{ toolName: string; costCents: number }> = [];
  let total = 0;
  for (const [toolName, enabled] of Object.entries(toolchain)) {
    if (!enabled) continue;
    const est = estimateCost(toolName);
    if (est.costCents > 0) {
      items.push({ toolName, costCents: est.costCents });
      total += est.costCents;
    }
  }
  return { items, totalCents: total };
}