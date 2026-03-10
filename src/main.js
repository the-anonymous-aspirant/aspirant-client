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
      // Sync cookie for non-AJAX requests (e.g. iframe content)
      document.cookie = `auth_token=${token}; path=/; SameSite=Strict; max-age=86400`;
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
