<template>
  <div class="api-card">
    <h3>{{ title }}</h3>
    <div class="api-status" :class="statusClass">{{ status }}</div>
    <p v-if="rowCount !== null" class="row-count">{{ rowCount }} rows</p>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    props: {
      title: String,
      endpoint: String,
    },
    data() {
      return {
        status: '',
        statusClass: '',
        rowCount: null,
      };
    },
    async mounted() {
      try {
        const response = await axios.get(this.endpoint);
        this.status = `${response.status} OK`;
        this.statusClass = this.getStatusClass(response.status);
        const data = response.data.data ? response.data.data : response.data;
        this.rowCount = Array.isArray(data) ? data.length : null;
      } catch (error) {
        this.status = `${error.response ? error.response.status : 'ERR'} Error`;
        this.statusClass = 'error';
        this.rowCount = null;
      }
    },
    methods: {
      getStatusClass(status) {
        if (status >= 200 && status < 300) return 'success';
        if (status >= 400 && status < 500) return 'client-error';
        if (status >= 500) return 'server-error';
        return '';
      },
    },
  };
</script>

<style scoped>
  .api-card {
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    text-align: center;
  }

  .api-card h3 {
    color: var(--text-heading-card);
    font-size: var(--text-xl);
    margin: 0 0 var(--space-sm) 0;
  }

  .api-status {
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: var(--space-xs);
  }

  .api-status.success {
    color: var(--feedback-success);
  }

  .api-status.client-error {
    color: var(--brand-primary);
  }

  .api-status.server-error,
  .api-status.error {
    color: var(--feedback-error);
  }

  .row-count {
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
