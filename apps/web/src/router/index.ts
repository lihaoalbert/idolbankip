import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore, type UserRole } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/pages/HomePage.vue') },
  { path: '/ips', name: 'ip-list', component: () => import('@/pages/IpListPage.vue') },
  { path: '/ips/:code', name: 'ip-detail', component: () => import('@/pages/IpDetailPage.vue'), props: true },
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('@/pages/RegisterPage.vue'), meta: { public: true } },
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
    path: '/creator',
    name: 'creator-dashboard',
    component: () => import('@/pages/creator/CreatorDashboard.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/ips/new',
    name: 'ip-create',
    component: () => import('@/pages/creator/IpCreatePage.vue'),
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
  },
  {
    path: '/creator/ips/:id',
    name: 'ip-edit',
    component: () => import('@/pages/creator/IpEditPage.vue'),
    props: true,
    meta: { requiresAuth: true, roles: ['CREATOR'] as UserRole[] },
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
  next();
});

export default router;
