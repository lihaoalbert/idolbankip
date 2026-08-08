import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useDarkMode } from './composables/useDarkMode';
import './styles/fonts.css';
import './styles/tailwind.css';
import './styles/app.css';

// 在挂载前先应用主题, 避免亮/暗闪烁
useDarkMode().init();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');