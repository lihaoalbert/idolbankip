import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

const STORAGE_KEY = 'ibi-ren-admin-auth';

interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'CREATOR' | 'BUYER';
  displayName: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);

  const isAuthenticated = computed(() => !!accessToken.value && user.value?.role === 'ADMIN');
  const role = computed(() => user.value?.role);

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      user: user.value, accessToken: accessToken.value, refreshToken: refreshToken.value,
    }));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      user.value = obj.user; accessToken.value = obj.accessToken; refreshToken.value = obj.refreshToken;
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }

  async function bootstrap() {
    load();
    if (accessToken.value) {
      try { await fetchMe(); } catch { clear(); }
    }
  }

  async function login(email: string, password: string) {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '';
    const { data } = await axios.post(`${baseURL}/api/v1/auth/login`, { email, password });
    user.value = data.user;
    accessToken.value = data.accessToken;
    refreshToken.value = data.refreshToken;
    persist();
    if (data.user.role !== 'ADMIN') {
      clear();
      throw new Error('非管理员账号,无法登录控制台');
    }
  }

  async function fetchMe() {
    const { apiClient } = await import('@/api/client');
    const { data } = await apiClient.get('/users/me');
    if (data.user.role !== 'ADMIN') { clear(); throw new Error('非管理员账号'); }
    user.value = data.user;
    persist();
  }

  async function refresh() {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '';
    const { data } = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refreshToken: refreshToken.value });
    accessToken.value = data.accessToken;
    refreshToken.value = data.refreshToken;
    persist();
  }

  function logout() {
    clear();
  }

  function clear() {
    user.value = null; accessToken.value = null; refreshToken.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { user, accessToken, refreshToken, isAuthenticated, role, bootstrap, login, refresh, logout, clear, fetchMe };
});
