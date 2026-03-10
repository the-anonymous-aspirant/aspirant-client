/**
 * @fileoverview This file contains global state variables and functions for managing the application's debug mode.
 * It uses Vue's reactive `ref` to create a reactive reference for the debug mode state.
 */

/**
 * A reactive reference to the application's debug mode state.
 * @type {import('vue').Ref<boolean>}
 */

/**
 * Toggles the application's debug mode state.
 * @function
 * @returns {void}
 */
// global_state_manager.js

import { ref, computed } from 'vue';
export const debugMode = ref(false);
export const toggleDebugMode = () => (debugMode.value = !debugMode.value);

export const collapsed = ref(false);
export const isMobile = ref(false);
export const sidebarHidden = ref(false);

// Check if device is mobile
export const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768;
  if (isMobile.value) {
    sidebarHidden.value = true;
  }
};

export const toggleSidebar = () => {
  if (isMobile.value) {
    sidebarHidden.value = !sidebarHidden.value;
  } else {
    collapsed.value = !collapsed.value;
  }
};

export const SIDEBAR_WIDTH = '200px';
export const SIDBAR_WIDTH_COLLAPSED = '120px';
export const sidebarWidth = computed(() => {
  if (isMobile.value && sidebarHidden.value) {
    return '0px';
  }
  return collapsed.value ? SIDBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;
});
