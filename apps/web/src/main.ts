import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useDarkMode } from './composables/useDarkMode';
import { captureUtm } from './utils/utm';
import './styles/fonts.css';
import './styles/tailwind.css';
import './styles/app.css';

// 在挂载前先应用主题, 避免亮/暗闪烁
useDarkMode().init();

// UTM 归因 — 入口 URL 带 utm_source/medium/campaign 时写入 sessionStorage (首次写入优先)
captureUtm();

// 百度统计 — 仅配置了 VITE_BAIDU_TJ_ID 时注入 hm.js (投放分渠道 UV 统计);
// 未配置则不加载任何第三方脚本
const baiduTjId = import.meta.env.VITE_BAIDU_TJ_ID as string | undefined;
if (baiduTjId) {
  const s = document.createElement('script');
  s.src = `https://hm.baidu.com/hm.js?${baiduTjId}`;
  s.async = true;
  document.head.appendChild(s);
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');