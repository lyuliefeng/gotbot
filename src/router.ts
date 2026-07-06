import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import WorkspacePage from './pages/WorkspacePage.vue'
import ToolsPage from './pages/ToolsPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import OperationHistoryPage from './pages/OperationHistoryPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import LoginPage from './pages/LoginPage.vue'
import AboutPage from './pages/AboutPage.vue'
import { useAppStore } from './stores/app'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage, meta: { public: true, shell: false } },
    { path: '/', name: 'home', component: HomePage },
    { path: '/workspace', name: 'workspace', component: WorkspacePage },
    { path: '/tools', name: 'tools', component: ToolsPage },
    { path: '/history', name: 'history', component: HistoryPage },
    { path: '/operations', name: 'operations', component: OperationHistoryPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/about', name: 'about', component: AboutPage },
  ],
})

router.beforeEach((to) => {
  const store = useAppStore()
  const isPublic = to.meta.public === true
  if (!store.isAuthenticated && !isPublic) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }
  if (store.isAuthenticated && to.path === '/login') {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/workspace'
    return redirect
  }
  return true
})

export default router
