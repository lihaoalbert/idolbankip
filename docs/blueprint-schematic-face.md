# Blueprint SchematicFace — 视觉化规范

> Blueprint 2.0 Track A 的核心组件。
> **目的**:把 L1-L6 的 46 个参数,实时渲染成一张"工程图风格"的人脸矢量图,送给生图大模型作 ControlNet 结构参考。
> **状态**:设计稿,待 review。

---

## 0. 概述

当前 Blueprint 的核心矛盾:**8 层 46 个字段全靠文字传给生图模型,模型对"脸型指数 0.62,颧骨突出度 0.4"这种结构化数字响应弱**。

SchematicFace 的解决方案:**把 L1-L6 实时渲染成矢量图,作为 ControlNet canny/depth 输入**——结构由图管,氛围由文字管,两者分工。

### 核心指标

| 维度 | 目标 |
|---|---|
| 渲染方式 | 纯前端 HTML5 Canvas + SVG 混合,**零 API 成本** |
| 滑块响应延迟 | < 50 ms(用户拖滑块时实时更新) |
| 输出尺寸 | 600×800 px(3:4 portrait) |
| 输出格式 | PNG dataURL(给 ControlNet)+ SVG inline(给 UI) |
| 视觉风格 | 工程图 / 矢量插画 / 中性灰 — **不像照片,不像卡通,不像手绘** |
| 视角 | MVP 仅正视图;3 视图(正/3-4/侧)留到 Track A.2 |

---

## 1. 设计原则(7 条硬约束)

| # | 原则 | 为什么 |
|---|---|---|
| **P1** | **每个参数都有可见映射** — 46 个字段全部分配到画面某区域,无悬空字段 | 用户拖滑块必须看到对应部位变化,否则失去"参数透明"价值(Beta #1 反馈) |
| **P2** | **中性灰基底** — 皮肤/底色用 #D4C9B8 暖中性灰,不被特定人种肤色锁死 | 不污染 ControlNet 对结构的识别(肤色会污染训练分布) |
| **P3** | **矢量优先,位图补充** — 轮廓/五官用 SVG path;阴影/纹理用 Canvas | 矢量缩放无损,阴影有模糊感 |
| **P4** | **不画照片质感** — 无毛孔特写,无皮肤反射,无写实光影 | 太像照片,ControlNet 把它当真人参考偷风格 |
| **P5** | **不画卡通** — 不用饱和色,不用粗黑线,不用夸张眼睛 | 太卡通,ControlNet 把它当 child 画处理 |
| **P6** | **可标注 / 可隐藏标注** — 每个区域右上角小角标 `L1.craniumShape` 等,默认隐藏,debug 模式打开 | 方便 review / 教学 / 用户学习字段含义 |
| **P7** | **默认值即"标准脸"** — 用 L1-L6 defaults 渲染出的人脸应当接近"标准年轻东亚女性" | 默认值不是空白;空白时给一个 fallback placeholder |

---

## 2. 画布坐标系

```
画布: 600 × 800 px(固定,SVG viewBox)
面部中心: (300, 420)
基准脸宽: 240 px(脸轮廓最宽处)
基准脸高: 360 px(发际线到下巴尖)
所有尺寸均以 "基准脸宽 (240px)" 为单位,即 face-width-unit (fwu)
1 fwu = 240 px

垂直分带(三停):
  上停 [额头]:        y ∈ [80, 200]   (h = 120 = 0.50 fwu)
  中停 [眉心→鼻底]:   y ∈ [200, 480]  (h = 280 = 1.17 fwu)
  下停 [鼻底→下巴]:    y ∈ [480, 720]  (h = 240 = 1.00 fwu)
  三停之和应近似相等 = 1.00 fwu(由 upperThirdRatio + midThirdRatio 控制)

水平分带:
  面部水平中心: x = 300
  眼水平线:    y = 300
  鼻尖水平线:  y = 440
  唇水平线:    y = 540
  下巴尖:      y = 720
```

**所有几何位置都用相对坐标**(0~1 表示相对基准),不用绝对像素。这样将来换画布尺寸 / 加 3 视图不用重算。

---

## 3. 11 个视觉区域划分

```
┌──────────────────────────────────────────────────────┐
│                    [R1: HAIR ZONE]                    │  ← L5.hair*
│  ┌──────────────────────────────────────────────┐   │
│  │  [R2: HAIRLINE]   [R3: FOREHEAD]              │  │  ← L5.hairline / L1.三停
│  │                                                │   │
│  │  ┌─────────┐                       ┌──────┐   │   │
│  │  │[R4:BROW]│                       │[R4]  │   │   │  ← L5.brow* / L1.cheekboneW
│  │  └─────────┘                       └──────┘   │   │
│  │  ┌──────┐                          ┌──────┐   │   │
│  │  │[R5:EYE]                         │[R5]  │   │   │  ← L3.eye* / L2.eyeSocket
│  │  └──────┘                          └──────┘   │   │
│  │              [R6: NOSE ZONE]                    │   │  ← L3.nose* / L2.browRidge
│  │              (含鼻梁/鼻翼/鼻尖)                  │   │
│  │  ┌──────┐                          ┌──────┐   │   │
│  │  │[R7:CHEEK]                       │[R7]  │   │   │  ← L1.cheekbone* / L2.buccalFat
│  │  └──────┘                          └──────┘   │   │
│  │              [R8: LIP ZONE]                     │   │  ← L3.lip* / L2.nasolabial
│  │              (含人中/上唇/下唇)                  │   │
│  │  [R9: CHIN/JAWLINE]    [R10: EAR]   [R10]      │   │  ← L1.jaw* / L3.chin / L3.ear*
│  │  [R11: SIDE BURN]      [R11]                   │   │  ← L5.sideburns
│  └────────────────────────────────────────────────┘   │
│       ↑ 全脸底色 [R-Skin: L4.skinTone/L4.texture]    │
└──────────────────────────────────────────────────────┘
```

| 区域 ID | 名称 | 屏幕位置 (cx, cy, w, h) in fwu | 关联字段数 | 关联字段(主) |
|---|---|---|---|---|
| **R1** | Hair Zone | (0.5, -0.15, 1.4, 0.4) | 4 | L5.hairStyle, hairColor, hairline, sideburns |
| **R2** | Hairline | (0.5, 0.05, 1.0, 0.10) | 1 | L5.hairline(细化为发际线形状) |
| **R3** | Forehead | (0.5, 0.18, 0.85, 0.20) | 1 | L1.upperThirdRatio(三停) |
| **R4** | Brow | (0.30, 0.32) + (0.70, 0.32) 各 w=0.25 h=0.06 | 4 | L5.browShape, browColor, browDensity, L1.cheekboneWidth |
| **R5** | Eye | (0.30, 0.40) + (0.70, 0.40) 各 w=0.18 h=0.10 | 5 | L3.eyeShape, eyeApertureHeight, eyeDistance, L2.eyeSocketDepth |
| **R6** | Nose | (0.50, 0.55, 0.20, 0.30) | 4 | L3.noseLength, noseWidth, noseBridge, L2.browRidge |
| **R7** | Cheek | (0.22, 0.58) + (0.78, 0.58) 各 w=0.30 h=0.20 | 4 | L1.cheekboneProminence, L2.subcutaneousFat, buccalFat, L2.nasolabialFold(尾部) |
| **R8** | Lip | (0.50, 0.68, 0.30, 0.10) | 3 | L3.lipWidth, lipThickness, philtrumLength |
| **R9** | Chin/Jaw | (0.50, 0.85, 0.55, 0.20) | 4 | L1.jawWidth, jawAngle, L3.chinProtrusion, L1.faceIndex |
| **R10** | Ear | (0.05, 0.55) + (0.95, 0.55) 各 w=0.08 h=0.20 | 2 | L3.earPosition, earSize |
| **R11** | Sideburn | (0.08, 0.45) + (0.92, 0.45) 各 w=0.06 h=0.12 | 1 | L5.sideburns |
| **R-Skin** | 全脸底色 + 纹理 | 全脸 + 耳朵 + 脖子(若有) | 6 | L4.skinTone, skinTexture, freckles, moles, wrinkles, pores |
| **R-Decor** | 装饰层 | 覆盖在 R5/R7/R8 等上面 | 6 | L6.makeup, lipColor, blush, eyeshadow, accessory, facePaint |

**未单独成区域但叠加显示**:L6.accessory(glasses → 跨 R4+R5; earrings → 跨 R10)。

---

## 4. L1-L6 字段 → 视觉映射(46 项)

### L1 骨骼 (8 项)

| 字段 | 类型 | 视觉映射 | 0 / 低值 | 0.5 / 中值 | 1 / 高值(或 enum 映射) |
|---|---|---|---|---|---|
| `craniumShape` | enum | R1+R2+R3 上轮廓曲线形状 | `long`:椭圆顶部高 1.3 fwu 窄 | `medium`:椭圆顶部 1.0 fwu | `round`:圆形顶部 1.1 fwu 宽 / `flat`:扁平顶部 0.7 fwu |
| `faceIndex` | 1.0~1.6 | R9 下巴尖到发际线高度 / 脸宽比 | 1.0=正圆脸 | 1.2=标准椭圆 | 1.6=长脸 |
| `cheekboneWidth` | 0~1 | R7 横向位置 × 脸宽 | 0.3=窄(颧骨内收) | 0.55=标准 | 0.85=宽(外扩到接近脸轮廓) |
| `cheekboneProminence` | 0~1 | R7 阴影强度(Canvas radialGradient) | 0=无阴影 | 0.5=淡阴影 | 1=深阴影 + R7 微微外凸 path |
| `jawWidth` | 0~1 | R9 下颌轮廓宽度 | 0.3=尖下巴 | 0.5=标准 | 0.85=方下颌 |
| `jawAngle` | enum | R9 下颌角曲线角度 | `sharp`:锐角 path | `medium`:标准 | `soft`:钝角 path(几乎圆弧) |
| `upperThirdRatio` | 0~1 | R3 高度比例 | 0.25=额低 | 0.33=标准 | 0.40=额高 |
| `midThirdRatio` | 0~1 | R6 鼻区高度比例 | 0.28=中停短 | 0.33=标准 | 0.40=中停长(长鼻感) |

### L2 软组织 (6 项)

| 字段 | 类型 | 视觉映射 | 0 | 0.5 | 1 |
|---|---|---|---|---|---|
| `subcutaneousFat` | 0~1 | 全脸轮廓 path 的圆滑度(脂肪填充越多,棱角越圆) | 棱角分明(瘦削) | 标准 | 全脸膨胀 + 双下巴感 |
| `masseter` | 0~1 | R9 下颌角外凸程度 | 瓜子脸 | 标准 | 国字脸 path |
| `buccalFat` | 0~1 | R7 苹果肌区高亮(浅色 fill) | 凹陷 | 标准饱满 | 过度饱满(挤出感) |
| `eyeSocketDepth` | 0~1 | R5 周围阴影深度(深眼窝 → 眼眶阴影重) | 平眼窝(亚洲常见) | 标准 | 深眼窝(欧美常见) |
| `browRidge` | 0~1 | R4 上方 + R6 鼻梁阴影(高眉弓 → 鼻根阴影明显) | 平眉弓 | 标准 | 高眉弓(欧美感) |
| `nasolabialFold` | 0~1 | R7-R8 鼻翼到嘴角的折线 path | 无 | 微显 | 明显(成熟感) |

### L3 五官 (12 项)

| 字段 | 类型 | 视觉映射 | 0 / 低值 | 0.5 / 中值 | 1 / 高值 |
|---|---|---|---|---|---|
| `eyeDistance` | 0~1 | R5 左右眼水平位置 | 近 | 标准 | 远 |
| `eyeShape` | enum | R5 path 形状 | `single`:单眼皮弧 / `inner`:内双 / `double`:外双 / `phoenix`:丹凤眼 / `round`:圆眼 / `narrow`:细长 | — | — |
| `eyeApertureHeight` | 0~1 | R5 path 高度 | 0.2=眯眼 | 0.6=标准 | 1.0=大眼 |
| `noseLength` | 0~1 | R6 高度 | 0.2=短鼻 | 0.5=标准 | 1.0=长鼻 |
| `noseWidth` | 0~1 | R6 鼻翼宽度 | 0.2=窄 | 0.4=标准 | 0.7=宽鼻翼 |
| `noseBridge` | enum | R6 鼻梁 path 凸度 | `high`:明显高光 / `medium`:微凸 / `low`:平 | — | — |
| `lipWidth` | 0~1 | R8 唇宽 | 0.3=薄唇窄 | 0.5=标准 | 0.8=宽唇 |
| `lipThickness` | 0~1 | R8 上下唇 path 厚度 | 0.2=薄 | 0.45=标准 | 1.0=厚唇 |
| `earPosition` | 0~1 | R10 耳垂直位置 | 0=低(低于鼻) | 0.5=标准(与鼻齐) | 1=高(与眉齐) |
| `earSize` | 0~1 | R10 耳大小 | 0.2=小 | 0.4=标准 | 0.8=大 |
| `philtrumLength` | 0~1 | R6-R8 之间的人中距离 | 0=无人中(短上唇) | 0.5=标准 | 1=长人中 |
| `chinProtrusion` | 0~1 | R9 下巴尖 path 前后凸 | 内缩 | 标准 | 明显前凸 |

### L4 皮肤 (6 项)

| 字段 | 类型 | 视觉映射 |
|---|---|---|
| `skinTone` | enum | R-Skin 底色 fill:`fair #F0DCC8` / `light #E8C9A8` / `medium #D4B58A` / `olive #B8966B` / `tan #9C7A52` / `brown #7A5A3A` / `dark #4F3826` |
| `skinTexture` | enum | R-Skin 叠加:`smooth` 高光 (lighter overlay 0.1 alpha) / `normal` 无 / `rough` 颗粒噪点(noise pattern) / `matte` 哑光无高光 / `oily` T 区高光增强 |
| `freckles` | 0~1 | R7 上散布的褐色小圆点 fill(0~30 个随机但确定性 seed,密度随值) |
| `moles` | 0~1 | R-Skin 上 1-3 个深色小圆(位置固定,大小随值) |
| `wrinkles` | 0~1 | R6 鼻根 / R8 唇周 / R9 下巴的细曲线 path(随值变粗变多) |
| `pores` | 0~1 | R-Skin 叠加微纹理(细密点阵,密度随值) |

### L5 毛发 (8 项)

| 字段 | 类型 | 视觉映射 | 0 / 低值 | 0.5 / 中值 | 1 / 高值 |
|---|---|---|---|---|---|
| `hairStyle` | enum | R1 path 轮廓 | `straight_long`:长直发(肩下)/ `straight_short`:短直 / `wavy`:波浪 / `curly`:卷发密集 path / `ponytail`:马尾+后束 / `bob`:齐耳 / `bald`:R1 不画 | — | — |
| `hairColor` | enum | R1 + R2 fill | `black #1A1A1A` / `brown #4A2E1A` / `blonde #D4B872` / `red #8B3A1A` / `silver #B0B0B8` / `gray #707074` / `highlight`:底色 + 局部高亮 path | — | — |
| `hairline` | enum | R2 边缘 path | `high`:M 形后退 / `medium`:标准弧 / `low`:覆盖到眉 / `m_shape`:M 形发尖 | — | — |
| `browShape` | enum | R4 path 弧度 | `straight`/`arched`/`upward`/`downward`/`thick`/`thin` | — | — |
| `browColor` | enum | R4 stroke color | `black #1A1A1A` / `brown #4A2E1A` / `gray #707074` / `same_as_hair`:跟随 L5.hairColor | — | — |
| `browDensity` | 0~1 | R4 stroke 粗细 + 不透明度 | 0=几乎无眉 | 0.7=标准 | 1=浓眉(粗 stroke) |
| `lashes` | enum | R5 上下边缘 path | `long_dense`:多睫毛细线 / `short_dense`:少而密 / `long_sparse`:长而疏 / `short_sparse`:少而疏 | — | — |
| `sideburns` | 0~1 | R11 fill 高度 | 0=无鬓角 | 0.2=微露 | 0.8=长鬓角到下颌 |

### L6 修饰 (6 项)

| 字段 | 类型 | 视觉映射 |
|---|---|---|
| `makeup` | enum | 全脸 overlay 强度:`none` 无 / `natural` 0.05 alpha / `light` 0.15 / `heavy` 0.30 / `costume` 0.50(高饱和度) |
| `lipColor` | enum | R8 fill:`natural #C46A6A` / `red #C8324C` / `pink #E07892` / `orange #D88860` / `nude #B89078` / `dark #6A2030` |
| `blush` | 0~1 | R7 苹果肌区红色 radialGradient 叠加(alpha 随值) |
| `eyeshadow` | 0~1 | R5 上方扇形 path(色随 makeup:costume 时变紫/蓝,否则棕/灰) |
| `accessory` | enum | `none` 无 / `earrings` R10 下方挂件 / `necklace` R9 下方弧线 / `headband` R2 上方带 / `mask` R5+R6+R7 半遮 / `glasses` R4+R5 横梁+镜框 path |
| `facePaint` | 0~1 | R3+R7 上色块 / 花纹(随机 seed,1=覆盖 30% 面积) |

---

## 5. 配色板

### 5.1 肤色 (L4.skinTone)

| Enum | Hex | 用途 |
|---|---|---|
| fair | `#F0DCC8` | 最浅 |
| light | `#E8C9A8` | |
| medium | `#D4B58A` | **默认** |
| olive | `#B8966B` | |
| tan | `#9C7A52` | |
| brown | `#7A5A3A` | |
| dark | `#4F3826` | 最深 |

**重要**:7 个色阶是**中性灰基底**(#D4C9B8 ± warm 偏移),不锁特定人种。

### 5.2 头发 (L5.hairColor)

| Enum | Hex |
|---|---|
| black | `#1A1A1A` |
| brown | `#4A2E1A` |
| blonde | `#D4B872` |
| red | `#8B3A1A` |
| silver | `#B0B0B8` |
| gray | `#707074` |
| highlight | 同底色 + `#D4C088` 高光 path |

### 5.3 唇 (L6.lipColor)

| Enum | Hex |
|---|---|
| natural | `#C46A6A` |
| red | `#C8324C` |
| pink | `#E07892` |
| orange | `#D88860` |
| nude | `#B89078` |
| dark | `#6A2030` |

### 5.4 全局画布

| 元素 | Hex | 说明 |
|---|---|---|
| 背景 | `#F6F2EA`(cream,与 ibi.ren 主题一致) | 不透明,不发灰 |
| 主轮廓线 | `#0E0E0F` stroke 1.5 px | 矢量五官线条 |
| 辅轮廓线 | `#0E0E0F` stroke 0.5 px | 阴影/纹理辅助线 |
| 阴影 | `#0E0E0F` fill alpha 0.15~0.45(渐变) | R5/R6/R7 立体感 |
| 标注角标(L6 toggle on 时) | `#B83A2C` stamp-red font 8px mono | debug / 教学模式 |

---

## 6. 渲染 API 契约

### 6.1 组件接口

```ts
// apps/web/src/components/blueprint/SchematicFace.vue
<script setup lang="ts">
import type { Blueprint } from '@/api/blueprint';

interface Props {
  layers: Blueprint['layers']; // 接收 L1-L6 layers
  showAnnotations?: boolean;   // 默认 false,debug 模式打开
  resolution?: number;         // 默认 600
}
const props = withDefaults(defineProps<Props>(), {
  showAnnotations: false,
  resolution: 600,
});

// Expose 给父组件
defineExpose({
  toDataURL: () => string,         // 同步获取 PNG base64
  toSVG: () => string,             // 同步获取 SVG 字符串
});
</script>
```

### 6.2 输出契约

| 输出 | 用途 | 格式 | 大小 |
|---|---|---|---|
| UI 显示 | 当前步骤右侧 SchematicFace 面板 | SVG inline | 600×800 |
| ControlNet 输入 | 生图 API 调用时作 image input | PNG dataURL | 600×800,≤ 80 KB |
| 缓存 key | 避免重复渲染 | md5(L1~L6 JSON) | — |

### 6.3 渲染流程

```
1. props.layers 变化
2. 计算 46 字段的 visual params(查 §4 映射表)
3. 渲染 SVG(11 个 region × 几何 path)
4. 输出到 <svg> 元素(UI)
5. 异步将 SVG 序列化到 Canvas → toDataURL('image/png')
6. 缓存 dataURL 到 Pinia(给 Track A 生图 API 用)
```

**滑块响应**:SVG 路径重计算 < 50 ms(46 字段,11 区域,纯几何)。
**PNG 导出**:Canvas toDataURL 通常 5-15 ms,debounce 200 ms 即可。

---

## 7. ControlNet 集成契约(Track A 配套)

### 7.1 输入结构

```ts
// 生图 API 调用结构(伪代码)
{
  prompt: l7Prompt,                    // L7 输出(纯风格/摄影)
  negative_prompt: '...',
  controlnet: {
    image: schematicFaceDataURL,       // ← SchematicFace 600×800 PNG
    mode: 'canny',                     // 边缘提取
    weight: 0.85,                      // 结构主导
    guidance_start: 0.0,
    guidance_end: 0.8,
  },
  ip_adapter: {                        // 可选,MVP 跳过
    image: schematicFaceDataURL,
    weight: 0.3,
  },
  n: 4,                                // 4 张候选
  size: '1024x1024',
}
```

### 7.2 L7 prompt 改造

**当前 L7**(看 API 文件推测)把 L1-L6 全部转成文字描述 → 重复且冗长。

**新 L7**:**只输出风格 / 摄影描述**,所有结构描述交给 SchematicFace:

```
[before]
"A 25-year-old Asian woman with face index 1.35, cheekbone width 0.55,
 cheekbone prominence 0.4, jaw width 0.5, sharp jaw angle, upper third 0.33,
 mid third 0.34, subcutaneous fat 0.45, masseter 0.5, buccal fat 0.55,
 eye socket depth 0.3, brow ridge 0.6, no nasolabial fold, eye distance 0.5,
 double eyelid, eye aperture 0.6, nose length 0.5, nose width 0.4,
 medium nose bridge, lip width 0.5, lip thickness 0.45, ear position 0.5,
 ear size 0.4, philtrum 0.5, chin protrusion 0.5,
 medium skin, normal texture, no freckles, no moles, no wrinkles, pores 0.2,
 straight long black hair, medium hairline, arched brow, ..."

[after]
"young Asian woman, 25 years old, professional portrait photography,
 studio lighting with soft key light, shallow depth of field,
 cool-toned color grading, natural makeup, calm expression"
```

L7 输出只负责:**年龄段 + 人种/地域 + 摄影风格 + 灯光 + 色彩 + 表情**。结构 0 提及。

---

## 8. 不在 MVP 范围内

- 3 视图(正/3-4/侧)— Track A.2
- 动画 / 表情 / 视角旋转 — 远期(Phase 3+ FLAME)
- 阴影真实感(无 HDRI / 无 normal map)— SchematicFace 是 2D 工程图,不是 3D
- 皮肤次表面散射 / 反射 — 不需要
- 任意角度渲染 — 锁定正视图

---

## 9. 设计决策(2026-06-25 拍板)

| # | 决策 | 选择 | 备注 |
|---|---|---|---|
| **Q1** | 视觉风格 | **B**(中性灰 + 局部阴影) | P4/P5 中间路线,工程图 + 适量阴影。Track A 上线后根据 ControlNet 效果评估是否降级到 A |
| **Q2** | 标注角标默认状态 | **隐藏** | debug / 教学场景下点 🏷️ 切换按钮打开 |
| **Q3** | 性别编码位置 | **A**(加 `gender` 进 L1) | 仅加 `gender: 'male' \| 'female'`;`ageBucket` 留给 L7 prompt。加 gender 影响 R9(下颌) + R5(眉弓) path 计算 |
| **Q4** | 创作者首次进入 baseline | **B**(5 个快速预设按钮) | 亚洲女性 / 欧洲男性 / 中性少年 / 非洲女性 / 拉丁男性 — 点击即覆盖 L1-L6 默认值 |

---

## 10. 实施 checklist(Track A 启动后)

- [ ] Q1-Q4 决策落地(spec §9 已锁)
- [ ] L1 schema 加 `gender` 字段(前端 typescript + 后端 class-validator dto)
- [ ] 定义 5 个 PRESETS(每个覆盖完整 L1-L6 默认值)
- [ ] 写 `SchematicFace.vue` 骨架(11 region 占位 + Canvas + SVG 混合)
- [ ] 逐 region 实现 §4 字段映射(L1+L2 先,L3~L6 后)
- [ ] 实现 PNG dataURL 导出 + Pinia 缓存
- [ ] 接入 BlueprintWizard(右栏嵌入 SchematicFace + 顶部 Presets 按钮条)
- [ ] Track A 生图 API 集成(ControlNet canny input = SchematicFace)
- [ ] L7 prompt 改造(只输出风格,删结构描述)
- [ ] Beta 用户测试 8 步流程,确认 SchematicFace 拖滑块实时反馈

---

## 10. 实施 checklist(Track A 启动后)

- [ ] 决定 Q1 视觉风格(画 3 个对比样给我看)
- [ ] 决定 Q2 标注默认状态
- [ ] 决定 Q3 性别是否纳入 L1
- [ ] 决定 Q4 快速预设 vs 默认值
- [ ] 写 `SchematicFace.vue` 骨架(11 region 占位)
- [ ] 逐 region 实现 §4 字段映射(L1+L2 先,L3~L6 后)
- [ ] 实现 PNG dataURL 导出 + Pinia 缓存
- [ ] Track A 生图 API 集成(ControlNet canny input = SchematicFace)
- [ ] L7 prompt 改造(只输出风格,删结构描述)
- [ ] Beta 用户测试 8 步流程,确认 SchematicFace 拖滑块实时反馈

---

## 相关文档

- [`docs/blueprint.md`](./blueprint.md) — 创作者使用手册(待按本规范更新)
- [`docs/loop-engineering.md`](./loop-engineering.md) — Loop 规范 v1.0
- 记忆 `project_blueprint_2_0_direction` — 路线决策(短期不绕 FLAME)