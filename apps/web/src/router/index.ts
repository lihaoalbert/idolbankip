import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { useBlueprintFeatureFlag } from '@/composables/useBlueprintFeatureFlag';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/pages/HomePage.vue') },
  { path: '/ips', name: 'ip-list', component: () => import('@/pages/IpListPage.vue') },
  { path: '/ips/:code', name: 'ip-detail', component: () => import('@/pages/IpDetailPage.vue'), props: true },
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('@/pages/RegisterPage.vue'), meta: { public: true } },
  { path: '/contact', name: 'contact', component: () => import('@/pages/ContactPage.vue'), meta: { public: true } },
  { path: '/legal/originality-commitment', name: 'legal-originality-commitment', component: () => import('@/pages/OriginalityCommitmentPage.vue'), meta: { public: true } },
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
    meta: { requiresAuth: true, roles: ['BUYER'] as UserRole[] },
  },
  {
    path: '/creator',
    name: 'creator-dashboard',
    component: () => import('@/pages/creator/CreatorDashboard.vue'),
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
