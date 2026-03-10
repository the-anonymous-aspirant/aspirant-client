<template>
  <div class="system-health-view">
    <h1>System Health</h1>
    <h2 class="page-subtitle">Container metrics, disk usage, and database statistics</h2>

    <div v-if="loading" class="loading-text">Loading system data...</div>
    <div v-if="error" class="error-text">{{ error }}</div>

    <!-- Disk Overview -->
    <template v-if="disk">
      <div class="health-card wide">
        <h3>Disk Usage</h3>
        <div class="disk-bar-container">
          <div class="disk-bar">
            <div class="disk-bar-fill" :style="{ width: disk.percent_used + '%' }"></div>
          </div>
          <span class="disk-label">{{ disk.used_gb }} / {{ disk.total_gb }} GB ({{ disk.percent_used }}%)</span>
        </div>
        <div class="disk-details">
          <div class="disk-stat">
            <span class="info-label">Free</span>
            <span class="info-value">{{ disk.free_gb }} GB</span>
          </div>
          <div class="disk-stat">
            <span class="info-label">Images</span>
            <span class="info-value">{{ images.total_count }} ({{ formatMB(images.total_size_mb) }})</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Containers -->
    <template v-if="containers.length > 0">
      <div class="section-header">
        <h3>Containers</h3>
        <span class="container-count">{{ runningCount }} / {{ containers.length }} running</span>
      </div>
      <div class="container-grid">
        <div
          v-for="c in containers"
          :key="c.name"
          class="container-card"
          :class="{ stopped: c.status !== 'running' }"
        >
          <div class="container-header">
            <span class="container-dot" :class="c.status === 'running' ? 'healthy' : 'unhealthy'"></span>
            <span class="container-name">{{ c.name }}</span>
            <span class="container-status">{{ c.status }}</span>
          </div>

          <template v-if="c.status === 'running'">
            <!-- CPU -->
            <div class="metric-row">
              <span class="metric-label">CPU</span>
              <div class="metric-bar">
                <div class="metric-bar-fill cpu" :style="{ width: Math.min(c.cpu_percent, 100) + '%' }"></div>
              </div>
              <span class="metric-value">{{ c.cpu_percent }}%</span>
            </div>

            <!-- Memory -->
            <div class="metric-row">
              <span class="metric-label">MEM</span>
              <div class="metric-bar">
                <div class="metric-bar-fill mem" :style="{ width: Math.min(c.memory_percent || 0, 100) + '%' }"></div>
              </div>
              <span class="metric-value">{{ c.memory_usage_mb }} MB</span>
            </div>

            <!-- Network -->
            <div class="metric-row network">
              <span class="metric-label">NET</span>
              <span class="metric-value">{{ c.network_rx_mb }} MB in / {{ c.network_tx_mb }} MB out</span>
            </div>

            <div class="container-uptime">{{ c.uptime }}</div>
          </template>
        </div>
      </div>
    </template>

    <!-- Volumes -->
    <template v-if="volumes.length > 0">
      <div class="health-card wide">
        <h3>Volumes</h3>
        <div class="info-rows">
          <div v-for="v in volumes" :key="v.name" class="info-row">
            <span class="info-label mono">{{ v.name }}</span>
            <span class="info-value">{{ formatMB(v.size_mb) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Database Stats -->
    <template v-if="dbStats">
      <div class="health-card wide">
        <h3>Database</h3>
        <div class="db-summary">
          <span>{{ dbStats.table_count }} tables</span>
          <span>{{ dbStats.total_rows?.toLocaleString() }} rows</span>
          <span>{{ formatMB(dbStats.total_size_mb) }}</span>
        </div>
        <div class="info-rows">
          <div v-for="t in dbStats.tables" :key="t.name" class="info-row">
            <span class="info-label mono">{{ t.name }}</span>
            <span class="info-value">{{ t.rows?.toLocaleString() }} rows ({{ formatMB(t.size_mb) }})</span>
          </div>
        </div>
      </div>
    </template>

    <button class="btn-refresh" @click="fetchAll">Refresh</button>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  data() {
    return {
      loading: true,
      error: null,
      containers: [],
      disk: null,
      volumes: [],
      images: { total_count: 0, total_size_mb: 0 },
      dbStats: null,
      refreshInterval: null,
    };
  },
  computed: {
    runningCount() {
      return this.containers.filter(c => c.status === 'running').length;
    },
  },
  methods: {
    formatMB(mb) {
      if (mb == null) return '—';
      if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
      return mb.toFixed(1) + ' MB';
    },
    async fetchAll() {
      this.loading = !this.disk;
      this.error = null;
      try {
        const [containersRes, diskRes, dbRes] = await Promise.allSettled([
          axios.get('/api/system/containers'),
          axios.get('/api/system/disk'),
          axios.get('/api/system/db-stats'),
        ]);

        if (containersRes.status === 'fulfilled') {
          this.containers = containersRes.value.data.containers || [];
        }

        if (diskRes.status === 'fulfilled') {
          this.disk = diskRes.value.data.disk;
          this.volumes = diskRes.value.data.volumes || [];
          this.images = diskRes.value.data.images || { total_count: 0, total_size_mb: 0 };
        }

        if (dbRes.status === 'fulfilled') {
          this.dbStats = dbRes.value.data.data;
        }

        // Show error only if all requests failed
        const allFailed = [containersRes, diskRes, dbRes].every(r => r.status === 'rejected');
        if (allFailed) {
          this.error = 'Failed to reach system endpoints';
        }
      } catch (err) {
        this.error = 'Unexpected error: ' + (err.message || 'Unknown');
      }
      this.loading = false;
    },
  },
  mounted() {
    this.fetchAll();
    this.refreshInterval = setInterval(() => this.fetchAll(), 30000);
  },
  beforeUnmount() {
    clearInterval(this.refreshInterval);
  },
};
</script>

<style scoped>
.system-health-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xl);
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  margin-top: var(--space-2xl);
}

.error-text {
  color: var(--feedback-error);
  margin-bottom: var(--space-lg);
}

/* Shared card styles */
.health-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.health-card.wide {
  width: 100%;
}

.health-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

/* Disk bar */
.disk-bar-container {
  margin-bottom: var(--space-md);
}

.disk-bar {
  height: 20px;
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--space-xs);
}

.disk-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--feedback-success), var(--brand-primary));
  border-radius: var(--radius-sm);
  transition: width 0.5s ease;
}

.disk-label {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.disk-details {
  display: flex;
  gap: var(--space-xl);
}

.disk-stat {
  display: flex;
  gap: var(--space-sm);
}

/* Section header */
.section-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  width: 100%;
  margin-bottom: var(--space-md);
}

.section-header h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0;
}

.container-count {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Container grid */
.container-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.container-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
}

.container-card.stopped {
  opacity: 0.5;
}

.container-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.container-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.container-dot.healthy {
  background-color: var(--feedback-success);
}

.container-dot.unhealthy {
  background-color: var(--feedback-error);
}

.container-name {
  color: var(--text-on-dark);
  font-weight: 600;
  font-size: var(--text-sm);
  flex: 1;
}

.container-status {
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
}

/* Metric rows */
.metric-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.metric-label {
  color: var(--text-muted);
  font-size: var(--text-xs);
  width: 30px;
  flex-shrink: 0;
  font-weight: 600;
}

.metric-bar {
  flex: 1;
  height: 6px;
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 0.5s ease;
}

.metric-bar-fill.cpu {
  background-color: var(--brand-primary);
}

.metric-bar-fill.mem {
  background-color: var(--feedback-success);
}

.metric-value {
  color: var(--text-muted);
  font-size: var(--text-xs);
  min-width: 60px;
  text-align: right;
  font-family: monospace;
}

.metric-row.network {
  justify-content: space-between;
}

.metric-row.network .metric-value {
  min-width: auto;
}

.container-uptime {
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin-top: var(--space-xs);
  text-align: right;
}

/* Info rows */
.info-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--space-2xs) 0;
  border-bottom: 1px solid var(--surface-card-inner);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.info-value {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  text-align: right;
}

.mono {
  font-family: monospace;
  font-size: var(--text-xs);
}

/* DB summary */
.db-summary {
  display: flex;
  gap: var(--space-xl);
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--surface-card-inner);
}

/* Refresh button */
.btn-refresh {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  margin-top: var(--space-md);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-refresh:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

/* Mobile */
@media (max-width: 768px) {
  .container-grid {
    grid-template-columns: 1fr;
  }

  .system-health-view {
    padding: var(--space-md);
  }

  .disk-details {
    flex-direction: column;
    gap: var(--space-xs);
  }

  .db-summary {
    flex-direction: column;
    gap: var(--space-xs);
  }
}
</style>
