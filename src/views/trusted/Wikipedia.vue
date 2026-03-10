<template>
  <div class="wikipedia-view" :style="viewStyle">
    <div v-if="!ready" class="loading-text">Loading Wikipedia...</div>
    <div v-if="error" class="error-text">{{ error }}</div>
    <iframe
      v-if="ready"
      :src="iframeSrc"
      class="wikipedia-frame"
      @load="onFrameLoad"
    ></iframe>
  </div>
</template>

<script>
import { sidebarWidth } from '../../global_state_manager.js';

export default {
  data() {
    return {
      ready: false,
      error: null,
      iframeSrc: '',
    };
  },
  computed: {
    viewStyle() {
      return {
        left: sidebarWidth.value,
      };
    },
  },
  methods: {
    onFrameLoad() {
      this.ready = true;
    },
  },
  mounted() {
    const token = localStorage.getItem('user_token');
    if (token) {
      document.cookie = `auth_token=${token}; path=/; SameSite=Strict; max-age=86400`;
    }
    this.iframeSrc = '/api/wikipedia/content/wikipedia_en_all_maxi_2026-02';
    this.ready = true;
  },
};
</script>

<style scoped>
.wikipedia-view {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  text-align: center;
  padding: var(--space-2xl);
}

.error-text {
  color: var(--feedback-error);
  text-align: center;
  padding: var(--space-lg);
}

.wikipedia-frame {
  flex: 1;
  width: 100%;
  border: none;
}
</style>
