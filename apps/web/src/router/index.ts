import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useBlueprintFeatureFlag } from '@/composables/useBlueprintFeatureFlag';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/pages/HomePage.vue') },
  { path: '/ips', name: 'ip-list', component: () => import('@/pages/IpListPage.vue') },
  { path: '/ips/:code', name: 'ip-detail', component: () => import('@/pages/IpDetailPage.vue'), props: true },
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('@/pages/RegisterPage.vue'), meta: { public: true } },
  { path: '/auth/wechat/callback', name: 'auth-wechat-callback', component: () => import('@/pages/auth/WechatCallbackPage.vue'), meta: { public: true } },
  { path: '/auth/bind-phone', name: 'auth-bind-phone', component: () => import('@/pages/auth/BindPhonePage.vue'), meta: { public: true } },
  { path: '/contact', name: 'contact', component: () => import('@/pages/ContactPage.vue'), meta: { public: true } },
  { path: '/legal/originality-commitment', name: 'legal-originality-commitment', component: () => import('@/pages/OriginalityCommitmentPage.vue'), meta: { public: true } },
  { path: '/legal/ai-disclaimer', name: 'legal-ai-disclaimer', component: () => import('@/pages/AiDisclaimerPage.vue'), meta: { public: true } },
  {
    path: '/studio/catalog',
    name: 'studio-catalog',
    component: () => import('@/pages/StudioCatalogPage.vue'),
    meta: { public: true },
  },
  {
    path: '/studio/standards',
    name: 'studio-standards',
    component: () => import('@/pages/StudioStandardsPage.vue'),
    meta: { public: true },
  },
  {
    path: '/guide/creator',
    name: 'creator-guide',
    component: () => import('@/pages/CreatorGuidePage.vue'),
    meta: { public: true },
  },
  {
    path: '/guide/face',
    name: 'guide-face',
    component: () => import('@/pages/FacePromptGuidePage.vue'),
    meta: { public: true },
  },
  {
    path: '/checkout/:code',
    name: 'checkout',
    component: () => import('@/pages/CheckoutPage.vue'),
    props: true,
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/pages/MyOrdersPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orders/:id',
    name: 'order-detail',
    component: () => import('@/pages/OrderDetailPage.vue'),
    props: true,
    meta: { requiresAuth: true },
  },
  {
    path: '/my-assets',
    name: 'my-assets',
    component: () => import('@/pages/MyAssetsPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/creator/onboard',
    name: 'creator-onboard',
    component: () => import('@/pages/creator/OnboardPage.vue'),
    // R9.3: 解 BUYER-only role 锁 — 创作者 KYC 也走 onboarding, 只是页面里按 role 分支显示不同内容
    meta: { requiresAuth: true, roles: ['BUYER', 'CREATOR'] as UserRole[] },
  },
  {
    path: '/creator',
    name: 'creator-dashboard',
    component: () => import('@/pages/creator/CreatorChatPage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/chat',
    name: 'creator-chat',
    component: () => import('@/pages/creator/CreatorChatPage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/tasks',
    name: 'creator-tasks',
    component: () => import('@/pages/creator/TaskBoardPage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/ips/new',
    name: 'ip-create',
    component: () => import('@/pages/creator/IpWizard.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/ips/:id',
    name: 'ip-edit',
    component: () => import('@/pages/creator/IpWizard.vue'),
    props: true,
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  // FaceBlueprint 8 步向导 (Phase 1 Layered Prompt Generator)
  // /creator/blueprint/new/step/:step? → 进入向导,自动 POST 创建空 Blueprint 再 redirect 到 :id/step/:step
  // /creator/blueprint/:id/step/:step? → 已有 Blueprint,跳到指定步(1~8)
  // featureFlag: Phase C R2 kill switch — flag off 时 beforeEach redirect 到 creator-dashboard
  {
    path: '/creator/blueprint/new/step/:step?',
    name: 'blueprint-new',
    component: () => import('@/pages/creator/blueprint/BlueprintWizard.vue'),
    meta: {
      requiresAuth: true,
      roles: ['CREATOR'] as UserRole[],
      featureFlag: 'BLUEPRINT_WIZARD',
    },
  },
  {
    path: '/creator/blueprint/:id/step/:step?',
    name: 'blueprint-step',
    component: () => import('@/pages/creator/blueprint/BlueprintWizard.vue'),
    props: true,
    meta: {
      requiresAuth: true,
      roles: ['CREATOR'] as UserRole[],
      featureFlag: 'BLUEPRINT_WIZARD',
    },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/pages/NotificationsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/creator/api-keys',
    name: 'creator-api-keys',
    component: () => import('@/pages/creator/ApiKeysPage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  // AIGC 众包 (#30.7.1)
  {
    path: '/buyer/brief/new',
    name: 'buyer-brief-new',
    component: () => import('@/pages/buyer/BriefNewPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/buyer/briefs/:id',
    name: 'buyer-brief-detail',
    component: () => import('@/pages/buyer/BriefDetailPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  // R9.2: /buyer/briefs 独立列表页 (老 /buyer 路径已被 ChatPage 占用, 补独立 list 路由)
  {
    path: '/buyer/briefs',
    name: 'buyer-briefs-list',
    component: () => import('@/pages/buyer/BuyerBriefsListPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  // W6-R2 三分屏 chat 主页 — R2 起 /buyer 默认进 chat (R4 上线老路由 302)
  {
    path: '/buyer/chat',
    name: 'buyer-chat',
    component: () => import('@/pages/buyer/BuyerChatPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/buyer',
    name: 'buyer',
    component: () => import('@/pages/buyer/BuyerChatPage.vue'),
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  // W6-R4: /buyer/workbench (W4 D4 跨 workspace 集中审批页) → /buyer (chat 默认入口)
  // 老路由 302 上线 — 书签/旧链接自动跳到三分屏买家 chat
  {
    path: '/buyer/workbench',
    redirect: '/buyer',
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/creator/briefs',
    name: 'creator-briefs',
    component: () => import('@/pages/creator/BriefsBrowsePage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/briefs/:id',
    name: 'creator-brief-detail',
    component: () => import('@/pages/creator/CreatorBriefDetailPage.vue'),
    props: true,
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  // W3 W2 D1 Workspace 详情 — 创作者和买家共用页,内部按 role 分支显示
  {
    path: '/workspaces/:id',
    name: 'workspace-detail',
    component: () => import('@/pages/WorkspaceDetailPage.vue'),
    props: true,
    meta: { requiresAuth: true },
  },
  // W3 W2 D4 我的资产
  {
    path: '/creator/assets',
    name: 'creator-assets',
    component: () => import('@/pages/creator/CreatorAssetsPage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  // AI 助手 — 整页对话入口,浮动气泡在 AppLayout 常驻
  {
    path: '/assistant',
    name: 'assistant',
    component: () => import('@/pages/AssistantPage.vue'),
    meta: { requiresAuth: true },
  },
  // 公开个人主页 — 捏者 /u/:userId
  {
    path: '/u/:userId',
    name: 'user-profile',
    component: () => import('@/pages/UserProfilePage.vue'),
    props: true,
    meta: { public: true },
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue') },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; },
});

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (to.meta.public) return next();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } });
  }
  const requiredRoles = to.meta.roles as UserRole[] | undefined;
  if (requiredRoles && requiredRoles.length > 0 && !auth.hasAnyRole(requiredRoles)) {
    return next({ name: 'home' });
  }
  // Feature flag 守卫 (Phase C R2) — VITE_BLUEPRINT_WIZARD_ENABLED=false 时
  // 把 /creator/blueprint/* 跳到 /creator。Dashboard 卡片同时 v-if flag off 不渲染
  const requiredFlag = to.meta.featureFlag as string | undefined;
  if (requiredFlag === 'BLUEPRINT_WIZARD') {
    const { enabled } = useBlueprintFeatureFlag();
    if (!enabled.value) {
      return next({ name: 'creator-dashboard' });
    }
  }
  next();
});

export default router;
