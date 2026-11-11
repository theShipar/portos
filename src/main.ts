import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { flags } from './core/flags';
import { createAppRouter } from './router';
import { useCatalogStore } from './stores/catalog';
import '@fontsource-variable/urbanist/wght.css';
import './styles/tokens.css';
import './styles/base.css';

if (flags.v3Glass) document.documentElement.dataset.theme = 'v3';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(createAppRouter());
app.mount('#app');

useCatalogStore(pinia).load();
