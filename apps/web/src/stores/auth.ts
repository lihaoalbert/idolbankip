import { defineStore } from 'pinia';
import axios from 'axios';

export type UserRole = 'CREATOR' | 'BUYER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  companyName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  realName?: string;
  phone?: string;
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
    roles: (s) => s.user?.roles ?? [],
    isCreator(): boolean { return this.roles.includes('CREATOR'); },
    isBuyer(): boolean { return this.roles.includes('BUYER'); },
    isAdmin(): boolean { return this.roles.includes('ADMIN'); },
  },
  actions: {
    hasAnyRole(required: UserRole[]): boolean {
      if (!required || required.length === 0) return true;
      return this.roles.some((r) => required.includes(r));
    },
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
    async register(params: { email: string; password: string; roles: UserRole[]; displayName: string; companyName?: string }) {
      this.loading = true;
      try {
        const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/register`, params);
        this.user = data.user;
        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        saveToStorage(this.$state);
      } finally { this.loading = false; }
    },
    /**
     * W3 W1 D4: 手机号验证码登录
     * 后端返 { user, tokens, isNewUser } → 写 store
     * 后端返 { needRegister: true } → 不写 store, 由前端弹"选身份 + displayName"再调一次
     */
    async loginWithPhone(
      phone: string,
      code: string,
      opts: { role?: UserRole; displayName?: string } = {},
    ): Promise<{ isNewUser: boolean; needRegister?: boolean }> {
      this.loading = true;
      try {
        const { data } = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/phone/login`,
          { phone, code, role: opts.role, displayName: opts.displayName },
        );
        if (data.needRegister) {
          return { isNewUser: false, needRegister: true };
        }
        this.user = data.user;
        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        saveToStorage(this.$state);
        return { isNewUser: data.isNewUser };
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
          saveToStorage(this.$state);
        } catch {
          this.clear();
        }
      }
    },
    /**
     * 强制从服务端拉一次 user,刷新 roles。用于角色后台变更后(KYC 自动补 CREATOR 等)。
     * 401 时清空本地 auth。
     */
    async fetchMe() {
      if (!this.accessToken) throw new Error('Not authenticated');
      try {
        const { data } = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
        this.user = data.user;
        saveToStorage(this.$state);
      } catch (e: any) {
        if (e?.response?.status === 401) {
          this.clear();
        }
        throw e;
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