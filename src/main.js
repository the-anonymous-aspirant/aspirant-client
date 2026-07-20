/**
 * @fileoverview This file serves as the main entry point for the Vue.js application.
 * It initializes the Vue app, sets up routing, applies global styles, and configures
 * Axios interceptors to attach a user token to request headers. Additionally, it
 * integrates Vuetify for UI components and directives.
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
The interecptors ensure that any component that passes an axios request will have the token attached to the header.

*/
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('user_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Sync cookie for non-AJAX requests (e.g. iframe content): nginx
      // auth_request gates /browser-flows, /admin/penpot/ and /admin/histoire/,
      // and an iframe load carries no Authorization header, so the cookie is
      // the only credential those subrequests can present.
      //
      // `Secure` is not optional here (system_3 #2564). Without it this write
      // SHADOWS the server's hardened cookie: login.go issues auth_token as
      // Secure+HttpOnly, and this sets a same-name, same-path cookie from JS
      // that is neither. Browsers then send the soft one over `http://`, so the
      // session token traverses cleartext on the un-proxied origin. A JS-set
      // cookie can never be HttpOnly, but it can and must be Secure.
      //
      // Consequence, and it is the intended one: over plaintext the browser
      // silently declines to set this cookie, so the gated iframes do not
      // authenticate there. Failing closed on a cleartext origin is the point.
      document.cookie = `auth_token=${token}; path=/; SameSite=Strict; Secure; max-age=86400`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle authentication errors
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check if error is due to invalid authentication (401 Unauthorized)
    if (error.response && error.response.status === 401) {
      // Remove the invalid token from localStorage
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('user_role');
      document.cookie = 'auth_token=; path=/; max-age=0';
    }
    return Promise.reject(error);
  }
);

const vuetify = createVuetify({
  components,
  directives,
});

createApp(App).use(router).use(vuetify).mount('#app');
