import { defineStore } from 'pinia';
import axios from 'axios';

export type UserRole = 'CREATOR' | 'BUYER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  companyName?: string;
}

interface State {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
}

const STORAGE_KEY = 'ibi.auth';

function loadFromStorage(): Partial<State> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(state: State) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    );
  } catch {}
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export const useAuthStore = defineStore('auth', {
  state: (): State => {
    const persisted = loadFromStorage();
    return {
      user: persisted.user ?? null,
      accessToken: persisted.accessToken ?? null,
      refreshToken: persisted.refreshToken ?? null,
      loading: false,
    };
  },
  getters: {
    isAuthenticated: (s) => !!s.accessToken && !!s.user,
    role: (s) => s.user?.role,
  },
  actions: {
    async login(email: string, password: string) {
      this.loading = true;
      try {
        const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/login`,
          { email, password },
        );
        this.user = data.user;
        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        saveToStorage(this.$state);
      } finally { this.loading = false; }
    },
    async register(params: { email: string; password: string; role: UserRole; displayName: string; companyName?: string }) {
      this.loading = true;
      try {
        const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/register`, params);
        this.user = data.user;
        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        saveToStorage(this.$state);
      } finally { this.loading = false; }
    },
    async refresh() {
      if (!this.refreshToken) throw new Error('No refresh token');
      const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/refresh`, {
        refreshToken: this.refreshToken,
      });
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      saveToStorage(this.$state);
    },
    async logout() {
      try {
        if (this.refreshToken) {
          await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/logout`, {
            refreshToken: this.refreshToken,
          });
        }
      } catch {}
      this.clear();
    },
    async restore() {
      // 已有 token 时,验证有效性;失败则清空
      if (this.accessToken && !this.user) {
        try {
          const { data } = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/v1/users/me`, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
          });
          this.user = data.user;
        } catch {
          this.clear();
        }
      }
    },
    clear() {
      this.user = null;
      this.accessToken = null;
      this.refreshToken = null;
      clearStorage();
    },
  },
});