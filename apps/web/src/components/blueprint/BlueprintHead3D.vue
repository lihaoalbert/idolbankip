<script setup lang="ts">
/**
 * BlueprintHead3D — L1+L2 参数 → 简化 3D 头骨 mesh
 *
 * 数据源:BlueprintContext (由 BlueprintWizard provide)
 * 监听 ctx.blueprint.layers.L1_skeleton + L2_softTissue → rebuild mesh
 *
 * 交互:OrbitControls 拖拽旋转 + 滚轮缩放 + 双击复位
 * 渲染:背景 paper 色,半透明软材质,跟 catalog 视觉一致
 * 兜底:WebGL2 不可用时显示 fallback 提示,不阻塞表单填写
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildHead, disposeHead, type HeadParams } from '@/three/headBuilder';
import { L1_DEFAULTS, L2_DEFAULTS, L3_DEFAULTS, L4_DEFAULTS, L5_DEFAULTS, L6_DEFAULTS } from '@/api/blueprint';
import { BlueprintKey } from '@/pages/creator/blueprint/context';

const ctx = inject(BlueprintKey);
if (!ctx) throw new Error('BlueprintHead3D must be inside BlueprintWizard');

const container = ref<HTMLDivElement | null>(null);
const webglSupported = ref(true);
const headParams = computed<HeadParams>(() => {
  const bp = ctx.blueprint.value;
  return {
    L1: (bp?.layers.L1_skeleton as any) ?? L1_DEFAULTS,
    L2: (bp?.layers.L2_softTissue as any) ?? L2_DEFAULTS,
    L3: (bp?.layers.L3_features as any) ?? L3_DEFAULTS,
    L4: (bp?.layers.L4_skin as any) ?? L4_DEFAULTS,
    L5: (bp?.layers.L5_hair as any) ?? L5_DEFAULTS,
    L6: (bp?.layers.L6_decoration as any) ?? L6_DEFAULTS,
  };
});

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let headGroup: THREE.Group | null = null;
let animationId: number | null = null;
let resizeObserver: ResizeObserver | null = null;

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl')
    );
  } catch {
    return false;
  }
}

function initThree(width: number, height: number) {
  if (!container.value) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5efe6); // paper 背景

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 0.5, 4.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  // 光照 — 环境光 + 方向光,跟 catalog 暖色调
  const ambient = new THREE.AmbientLight(0xfff5e8, 0.55);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(2.5, 3, 4);
  scene.add(dirLight);
  // 补一点右侧轮廓光
  const rimLight = new THREE.DirectionalLight(0xffd9b3, 0.35);
  rimLight.position.set(-2, 1, -1);
  scene.add(rimLight);

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  controls.minDistance = 2.5;
  controls.maxDistance = 8;
  controls.target.set(0, 0, 0);

  // 双击复位
  renderer.domElement.addEventListener('dblclick', () => {
    if (!camera || !controls) return;
    camera.position.set(0, 0.5, 4.5);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  // 初始 mesh
  rebuildHead();

  // resize
  resizeObserver = new ResizeObserver(() => onResize());
  resizeObserver.observe(container.value);

  animate();
}

function rebuildHead() {
  if (!scene) return;
  if (headGroup) {
    scene.remove(headGroup);
    disposeHead(headGroup);
  }
  headGroup = buildHead(headParams.value);
  scene.add(headGroup);
}

function animate() {
  if (!renderer || !scene || !camera) return;
  animationId = requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene, camera);
}

function onResize() {
  if (!container.value || !renderer || !camera) return;
  const { clientWidth: w, clientHeight: h } = container.value;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

onMounted(() => {
  webglSupported.value = detectWebGL();
  if (!webglSupported.value || !container.value) return;
  const { clientWidth, clientHeight } = container.value;
  initThree(clientWidth, clientHeight);
});

// 监听参数变化 — rebuild mesh
watch(
  headParams,
  () => {
    if (webglSupported.value && scene) rebuildHead();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (animationId !== null) cancelAnimationFrame(animationId);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (headGroup && scene) {
    scene.remove(headGroup);
    disposeHead(headGroup);
    headGroup = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  scene = null;
  camera = null;
});
</script>

<template>
  <div class="relative h-full w-full overflow-hidden rounded-md border border-ink/10 bg-paper/40">
    <div v-if="!webglSupported" class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-ink/50">
      <div>
        <p class="mb-2 font-medium text-ink/70">3D 预览不可用</p>
        <p class="text-xs">您的浏览器不支持 WebGL,可在表单中继续编辑,效果将以参数保存。</p>
      </div>
    </div>
    <div v-else ref="container" class="h-full w-full" />
    <!-- 浮动控制提示 -->
    <div
      v-if="webglSupported"
      class="pointer-events-none absolute bottom-2 right-2 rounded bg-cream/80 px-2 py-1 text-xs text-ink/50 backdrop-blur"
    >
      拖拽旋转 · 滚轮缩放 · 双击复位
    </div>
    <!-- 数据徽章 -->
    <div
      v-if="webglSupported"
      class="pointer-events-none absolute left-2 top-2 rounded bg-cream/80 px-2 py-1 text-xs text-ink/60 backdrop-blur"
    >
      L1 {{ headParams.L1.craniumShape }} · L4 {{ headParams.L4.skinTone }} · L5 {{ headParams.L5.hairStyle }} · L6 {{ headParams.L6.accessory }}
    </div>
  </div>
</template>