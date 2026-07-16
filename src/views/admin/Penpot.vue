<template>
  <div class="penpot-view">
    <h1>Penpot Design</h1>
    <h2 class="page-subtitle">Self-hosted design tool — mockups, tokens, and component libraries</h2>

    <div class="status-banner" :class="statusClass">
      <span class="status-dot" :class="statusClass"></span>
      <span class="status-label">{{ statusLabel }}</span>
      <button class="btn-refresh" @click="checkStatus">Refresh</button>
    </div>

    <div class="launch-card">
      <p>
        Penpot runs as its own application on a same-origin admin path — it needs a full
        browser tab (canvas, shortcuts, websockets), not an embed.
      </p>
      <a class="launch-button" href="/admin/penpot/app/" target="_blank" rel="noopener">
        Open Penpot ↗
      </a>
      <ul class="notes">
        <li>Sign in with the Penpot account — registration is disabled on this instance.</li>
        <li>
          Password reset and account management run via <code>manage.py</code> on the cell
          (<code>docker exec … /opt/penpot/backend/manage.py</code>), see
          aspirant-deploy <code>docs/PENPOT_SPEC.md</code>.
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    data() {
      return {
        // null = checking, true = reachable, false = down
        reachable: null,
      };
    },
    computed: {
      statusClass() {
        if (this.reachable === null) return 'checking';
        return this.reachable ? 'healthy' : 'unhealthy';
      },
      statusLabel() {
        if (this.reachable === null) return 'CHECKING…';
        return this.reachable ? 'ONLINE' : 'UNREACHABLE';
      },
    },
    methods: {
      async checkStatus() {
        this.reachable = null;
        try {
          // Same-origin probe proxied by nginx to the Penpot frontend's
          // readyz (Penpot serves no CORS headers, so the design origin
          // cannot be probed directly from the SPA).
          await axios.get('/penpot-status');
          this.reachable = true;
        } catch {
          this.reachable = false;
        }
      },
    },
    mounted() {
      this.checkStatus();
    },
  };
</script>

<style scoped>
  .penpot-view {
    max-width: 720px;
    margin: 0 auto;
    padding: 1rem;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin: 1rem 0;
    background: #f5f5f5;
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #9e9e9e;
  }

  .status-dot.healthy {
    background: #2e7d32;
  }

  .status-dot.unhealthy {
    background: #c62828;
  }

  .status-label {
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .btn-refresh {
    margin-left: auto;
  }

  .launch-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.25rem;
  }

  .launch-button {
    display: inline-block;
    margin: 0.75rem 0;
    padding: 0.6rem 1.4rem;
    border-radius: 6px;
    background: #1976d2;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
  }

  .notes {
    margin-top: 0.75rem;
    color: #555;
    font-size: 0.9rem;
  }
</style>
