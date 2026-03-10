<template>
  <div class="admin-view">
    <h1>Admin</h1>
    <h2 class="page-subtitle">Admin stuff. Don't break anything.</h2>

    <div v-if="healthLoading" class="loading-text">Loading health data...</div>
    <div v-else-if="healthError" class="error-text">{{ healthError }}</div>

    <template v-if="health">
      <!-- Overall Status Banner -->
      <div class="status-banner" :class="health.status">
        <span class="status-dot" :class="health.status"></span>
        <span class="status-label">{{ health.status.toUpperCase() }}</span>
      </div>

      <!-- Info Grid -->
      <div class="health-grid">
        <!-- Server Info Card -->
        <div class="health-card">
          <h3>Server</h3>
          <div class="info-rows">
            <div class="info-row">
              <span class="info-label">Commit</span>
              <span class="info-value mono">{{ health.commit }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Uptime</span>
              <span class="info-value">{{ health.uptime }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Go Version</span>
              <span class="info-value mono">{{ health.go_version }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Checked at</span>
              <span class="info-value">{{ checkedAt }}</span>
            </div>
          </div>
        </div>

        <!-- Database Card -->
        <div class="health-card">
          <h3>
            Database
            <span class="status-badge" :class="health.database?.status">
              {{ health.database?.status || 'unknown' }}
            </span>
          </h3>
          <div class="info-rows">
            <div class="info-row" v-if="health.database?.error">
              <span class="info-label">Error</span>
              <span class="info-value error-text">{{ health.database.error }}</span>
            </div>
            <div class="info-row" v-if="health.database?.tables">
              <span class="info-label">Tables</span>
              <span class="info-value">{{ health.database.tables }}</span>
            </div>
          </div>
        </div>

        <!-- Memory Card -->
        <div class="health-card">
          <h3>Memory</h3>
          <div class="info-rows">
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">Allocated</span>
                <span class="info-value">{{ health.memory?.alloc_mb }} MB</span>
              </div>
              <span class="info-desc">Heap memory currently in use by Go objects</span>
            </div>
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">System</span>
                <span class="info-value">{{ health.memory?.sys_mb }} MB</span>
              </div>
              <span class="info-desc">Total memory obtained from the OS</span>
            </div>
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">Total Allocated</span>
                <span class="info-value">{{ health.memory?.total_alloc_mb }} MB</span>
              </div>
              <span class="info-desc">Cumulative memory allocated since server start</span>
            </div>
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">Heap Objects</span>
                <span class="info-value">{{ health.memory?.heap_objects?.toLocaleString() }}</span>
              </div>
              <span class="info-desc">Number of live objects on the heap</span>
            </div>
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">GC Cycles</span>
                <span class="info-value">{{ health.memory?.gc_cycles }}</span>
              </div>
              <span class="info-desc">Completed garbage collection cycles</span>
            </div>
            <div class="info-row-with-desc">
              <div class="info-row">
                <span class="info-label">Goroutines</span>
                <span class="info-value">{{ health.memory?.goroutines }}</span>
              </div>
              <span class="info-desc">Concurrent lightweight threads</span>
            </div>
          </div>
        </div>

        <!-- API Endpoints Card -->
        <div class="health-card wide">
          <h3>API Endpoints</h3>
          <div class="endpoint-grid">
            <div
              v-for="ep in endpoints"
              :key="ep.name"
              class="endpoint-item"
            >
              <span class="endpoint-dot" :class="ep.status"></span>
              <span class="endpoint-name">{{ ep.name }}</span>
              <span v-if="ep.rows !== null" class="endpoint-rows">{{ ep.rows }} rows</span>
              <span class="endpoint-detail mono">{{ ep.detail }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Refresh -->
      <button class="btn-refresh" @click="fetchHealth">Refresh</button>
    </template>

    <div class="application-cards">
      <application-card
        :image-url="appImages.default"
        title="S3 Assets"
        description="Image files and stuff"
        route="/admin/s3_assets"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default_user"
        title="User Resources"
        description="User accounts and permissions"
        route="/admin/users"
        @card-click="navigateTo"
      />
      <application-card
        :image-url="appImages.default"
        title="Voice Commander"
        description="Record voice commands and manage extracted tasks"
        route="/admin/voice-commander"
        @card-click="navigateTo"
      />
    </div>
  </div>
</template>

<script>
  import axios from 'axios';
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  const ENDPOINT_LIST = [
    { name: 'Health', url: '/api/health' },
    { name: 'Users', url: '/api/data_models/users' },
    { name: 'Roles', url: '/api/data_models/roles' },
    { name: 'Messages', url: '/api/data_models/message' },
    { name: 'Feeding Times', url: '/api/data_models/ludde_feeding_times' },
    { name: 'Game Scores', url: '/api/games/scores?game=_ping&limit=1' },
    { name: 'S3 Assets', url: '/api/s3-assets' },
    { name: 'Transcriber', url: '/api/transcriber/health' },
    { name: 'Commander', url: '/api/commander/health' },
  ];

  export default {
    components: {
      ApplicationCard,
    },

    data() {
      return {
        appImages: {
          default_user: '',
          default: '',
        },
        health: null,
        healthLoading: true,
        healthError: null,
        checkedAt: '',
        endpoints: [],
        refreshInterval: null,
      };
    },
    methods: {
      async loadImages() {
        try {
          for (const key of Object.keys(this.appImages)) {
            this.appImages[key] = await AssetManager.getAsset(key);
          }
        } catch (error) {
          console.error('Failed to load application images:', error);
        }
      },
      navigateTo(route) {
        this.$router.push(route);
      },
      async fetchHealth() {
        this.healthLoading = !this.health;
        this.healthError = null;
        try {
          const response = await axios.get('/api/health');
          this.health = response.data.data;
          this.checkedAt = new Date().toLocaleTimeString();
        } catch (err) {
          this.healthError = 'Failed to reach health endpoint: ' + (err.message || 'Unknown error');
        }
        this.healthLoading = false;
        this.checkEndpoints();
      },
      async checkEndpoints() {
        this.endpoints = ENDPOINT_LIST.map(ep => ({
          name: ep.name,
          status: 'checking',
          detail: '...',
          rows: null,
        }));

        const results = await Promise.allSettled(
          ENDPOINT_LIST.map(ep =>
            axios.get(ep.url).then(r => {
              const data = r.data.data ? r.data.data : r.data;
              const rows = Array.isArray(data) ? data.length : null;
              return { status: r.status, rows };
            })
          )
        );

        this.endpoints = ENDPOINT_LIST.map((ep, i) => {
          const result = results[i];
          if (result.status === 'fulfilled') {
            return {
              name: ep.name,
              status: 'healthy',
              detail: `${result.value.status}`,
              rows: result.value.rows,
            };
          } else {
            const code = result.reason?.response?.status || 'ERR';
            return {
              name: ep.name,
              status: 'unhealthy',
              detail: `${code}`,
              rows: null,
            };
          }
        });
      },
    },
    mounted() {
      this.loadImages();
      this.fetchHealth();
      this.refreshInterval = setInterval(() => this.fetchHealth(), 30000);
    },
    beforeUnmount() {
      clearInterval(this.refreshInterval);
    },
  };
</script>

<style scoped>
  .admin-view {
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

  .application-cards {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-lg);
    width: 100%;
    margin: var(--space-xl) 0;
  }

  .loading-text {
    color: var(--text-muted);
    font-size: var(--text-lg);
    margin-top: var(--space-2xl);
  }

  .error-text {
    color: var(--feedback-error);
  }

  /* Status Banner */
  .status-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-xl);
    font-weight: 600;
    font-size: var(--text-lg);
  }

  .status-banner.healthy {
    background-color: var(--surface-elevated);
    border: 2px solid var(--feedback-success);
    color: var(--feedback-success);
  }

  .status-banner.degraded {
    background-color: var(--surface-elevated);
    border: 2px solid var(--brand-primary);
    color: var(--brand-primary);
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    display: inline-block;
  }

  .status-dot.healthy {
    background-color: var(--feedback-success);
  }

  .status-dot.degraded {
    background-color: var(--brand-primary);
  }

  /* Health Grid */
  .health-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-lg);
    width: 100%;
    margin-bottom: var(--space-xl);
  }

  .health-card {
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
  }

  .health-card.wide {
    grid-column: 1 / -1;
  }

  .health-card h3 {
    color: var(--text-heading-card);
    font-size: var(--text-xl);
    margin: 0 0 var(--space-md) 0;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* Status Badge */
  .status-badge {
    font-size: var(--text-xs);
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-badge.healthy {
    background-color: var(--feedback-success);
    color: var(--text-on-dark);
  }

  .status-badge.unhealthy,
  .status-badge.unavailable {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
  }

  /* Info Rows */
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

  .info-row-with-desc {
    display: flex;
    flex-direction: column;
  }

  .info-row-with-desc .info-row {
    border-bottom: none;
  }

  .info-desc {
    color: var(--text-muted);
    font-size: var(--text-xs);
    padding: 0 0 var(--space-xs) 0;
    border-bottom: 1px solid var(--surface-card-inner);
  }

  .info-row-with-desc:last-child .info-desc {
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
    word-break: break-all;
    max-width: 60%;
  }

  .mono {
    font-family: monospace;
    font-size: var(--text-xs);
  }

  /* Endpoint Grid */
  .endpoint-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }

  .endpoint-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--surface-card-inner);
    border-radius: var(--radius-sm);
  }

  .endpoint-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .endpoint-dot.healthy {
    background-color: var(--feedback-success);
  }

  .endpoint-dot.unhealthy {
    background-color: var(--feedback-error);
  }

  .endpoint-dot.checking {
    background-color: var(--text-muted);
  }

  .endpoint-name {
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    flex: 1;
  }

  .endpoint-rows {
    color: var(--text-muted);
    font-size: var(--text-xs);
    margin-left: auto;
  }

  .endpoint-detail {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  /* Refresh Button */
  .btn-refresh {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    font-weight: 600;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-lg);
    border: none;
    cursor: pointer;
    font-size: var(--text-base);
    margin-bottom: var(--space-lg);
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .btn-refresh:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .health-grid {
      grid-template-columns: 1fr;
    }

    .endpoint-grid {
      grid-template-columns: 1fr;
    }

    .admin-view {
      padding: var(--space-md);
    }
  }
</style>
