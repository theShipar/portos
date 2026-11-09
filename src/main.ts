import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { useCatalogStore } from './stores/catalog';
import './styles/tokens.css';
import './styles/base.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(createAppRouter());
app.mount('#app');

useCatalogStore(pinia).load();
