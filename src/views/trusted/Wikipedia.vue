<template>
  <div class="wikipedia-view">
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
export default {
  data() {
    return {
      ready: false,
      error: null,
      iframeSrc: '',
    };
  },
  methods: {
    onFrameLoad() {
      this.ready = true;
    },
  },
  mounted() {
    // Ensure auth cookie is set before loading the iframe
    const token = localStorage.getItem('user_token');
    if (token) {
      document.cookie = `auth_token=${token}; path=/; SameSite=Strict; max-age=86400`;
    }
    this.iframeSrc = '/api/wikipedia/';
    this.ready = true;
  },
};
</script>

<style scoped>
.wikipedia-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
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
