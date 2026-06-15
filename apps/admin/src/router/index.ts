import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
  },
  {
    path: '/ips/queue',
    name: 'ip-queue',
    component: () => import('@/pages/IpQueuePage.vue'),
  },
  {
    path: '/ips/:id',
    name: 'ip-detail-admin',
    component: () => import('@/pages/IpDetailAdminPage.vue'),
    props: true,
  },
  {
    path: '/kyc/queue',
    name: 'kyc-queue',
    component: () => import('@/pages/KycQueuePage.vue'),
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/pages/OrdersPage.vue'),
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@/pages/UsersPage.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/NotFoundPage.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; },
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) return true;
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  return true;
});

export default router;
