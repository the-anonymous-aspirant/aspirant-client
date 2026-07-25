/**
 * @fileoverview This file serves as the main entry point for the Vue.js application.
 * It initializes the Vue app, sets up routing, applies global styles, and configures
 * Axios interceptors to attach a user token to request headers. Additionally, it
 * integrates Vuetify for UI components and directives. The session token is
 * NOT handled here: it lives solely in the server's HttpOnly cookie.
 */
import { createApp } from 'vue';
import App from './App.vue';
import router from './router/router';
import './style.css';
// Design-system (@aspirant/design-system): tokens + component styles.
// tokens.css values mirror the App.vue :root block verbatim, so nothing changes
// visually today; it's the seam that lets aspirant-client's inline token block
// be retired later. styles.css carries the component CSS (.card, .sidebar, …) —
// the Vite lib build ships it separately and does not inject it, so consuming
// AspCard without this import renders it unstyled.
import '@aspirant/design-system/tokens.css';
import '@aspirant/design-system/styles.css';
import axios from 'axios';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/*
The main.js file is executed in initialization.

There is deliberately no request interceptor attaching the session token.
The server issues auth_token as a Secure+HttpOnly+SameSite=Strict cookie at
login (aspirant-server handlers/login.go) and accepts it everywhere it
matters: the /api/ auth middleware falls back to the cookie when no
Authorization header is present, and the nginx auth_request gate on
/browser-flows, /admin/penpot/ and /admin/histoire/ authenticates on the
cookie alone. Same-origin XHR, fetch and full-page navigations all send it
with no withCredentials needed, so the cookie carries every request shape
this app makes.

Mirroring it into localStorage and an Authorization header therefore bought
nothing and cost the HttpOnly protection the server had already given us —
any XSS on the origin could read the token straight out of storage
(system_3 #2564). The mirror is gone; the cookie is the sole session
carrier. Do not reintroduce a JS-side copy: a cookie written from
document.cookie can never be HttpOnly, so a same-name write silently
downgrades the server's hardened one.
*/

// Response interceptor: clear cached identity when the server rejects us.
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check if error is due to invalid authentication (401 Unauthorized)
    if (error.response && error.response.status === 401) {
      // Ask the server to drop the cookie too. The token is already rejected,
      // but the browser keeps sending it until something expires it, and only
      // the server can — auth_token is HttpOnly (system_3 #2589). Safe to fire
      // from inside a 401 handler: /api/logout is unauthenticated and answers
      // 200, so it cannot recurse into this branch.
      fetch('/api/logout', { method: 'POST' }).catch(() => {});

      // Display state only.
      localStorage.removeItem('user_name');
      localStorage.removeItem('user_role');
    }
    return Promise.reject(error);
  }
);

const vuetify = createVuetify({
  components,
  directives,
});

createApp(App).use(router).use(vuetify).mount('#app');
