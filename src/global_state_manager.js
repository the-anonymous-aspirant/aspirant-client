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

// Incremented on login/logout to force router-view remount
export const authVersion = ref(0);
export const bumpAuthVersion = () => authVersion.value++;

// The shell's one breakpoint (§3.119, #9190): a phone is under 768px, a
// desktop 768px and up. CSS reads the same bound as max-width: 767.98px.
export const SHELL_DESKTOP_MIN = 768;
const isMobileWidth = (width) => width < SHELL_DESKTOP_MIN;

export const collapsed = ref(false);
// Both start from the width at load, so a phone opens with the drawer closed
// from the first frame (#9105 B1-1: it opened over a scrim on every route).
export const isMobile = ref(isMobileWidth(window.innerWidth));
export const sidebarHidden = ref(isMobile.value);

// Track last known width to distinguish keyboard resize (height-only) from real resize
let lastKnownWidth = window.innerWidth;

// Check if device is mobile — only react to actual width changes
export const checkMobile = () => {
  const currentWidth = window.innerWidth;
  const widthChanged = currentWidth !== lastKnownWidth;
  lastKnownWidth = currentWidth;

  const wasMobile = isMobile.value;
  isMobile.value = isMobileWidth(currentWidth);

  // Only hide sidebar when transitioning to mobile via a real width change,
  // not when the keyboard opens (height-only resize)
  if (isMobile.value && !wasMobile && widthChanged) {
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
