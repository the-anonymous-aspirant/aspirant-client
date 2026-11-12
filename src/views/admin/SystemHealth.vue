<template>
  <div class="system-health-view page">
    <h1>System Health</h1>
    <h2 class="page-subtitle">Container metrics, disk usage, and database statistics</h2>

    <!-- One treatment for the three things this read can be doing (#5302).
         Before that, a total failure rendered the heading, the Refresh button
         and nothing else — indistinguishable from a healthy system with no data
         yet — and the catch arm put `err.message` on the page.

         The copy switches on the state (#5312). It did not, and this was the
         one call site where that mattered: every other page pins its `state`
         to a literal, so static words are correct there, while this one passes
         a variable and so said "System health did not load" under an empty
         state's icon. `MessageBoardView.vue` is the pattern. -->
    <ReadState
      v-if="readState !== 'ready'"
      :state="readState"
      :heading="readState === 'failed' ? 'System health did not load' : 'No system data yet'"
      :message="
        readState === 'failed'
          ? 'None of the system endpoints answered. The services may be restarting, or the monitor sidecar may be down.'
          : 'The endpoints answered but reported nothing to show. The monitor sidecar may still be starting up.'
      "
      :still-works="
        readState === 'failed'
          ? 'The rest of the admin area is unaffected — this page reads its own endpoints.'
          : ''
      "
      skeleton="block"
      height="12rem"
      @retry="fetchAll"
    />

    <!-- Overall Status Banner -->
    <template v-if="health">
      <!-- `status` is guarded, not assumed (#5317). Unguarded,
           `health.status.toUpperCase()` throws on any 200 whose body omits it —
           and a thrown render does not fall back, it FREEZES: Vue stops
           updating the component and whatever was on screen at the time, in
           practice the loading skeleton, stays there forever. A page whose job
           is reporting health should not be the thing that breaks when a health
           check answers oddly. Same fault class as #5312, which existed because
           this file read a shape the server had stopped serving; the shape has
           already moved under it once. -->
      <div class="status-banner" :class="health.status || 'unknown'">
        <span class="status-dot" :class="health.status || 'unknown'"></span>
        <span class="status-label">{{ (health.status || 'unknown').toUpperCase() }}</span>
      </div>

      <!-- Server checks. `/health` serves `{status, service, checks}` and
           nothing else: the Server and Memory cards that used to sit here read
           `commit`, `uptime`, `go_version` and `memory.*`, which this endpoint
           deliberately does not send (CWE-200, #3865). They rendered nothing in
           production because `health` was undefined; wiring the real shape
           without removing them would have rendered `undefined MB` instead,
           which is worse. What IS served is shown (#5312). -->
      <div class="health-grid">
        <div class="health-card">
          <h3>Server</h3>
          <div class="info-rows">
            <div class="info-row"><span class="info-label">Service</span><span class="info-value mono">{{ health.service || '—' }}</span></div>
            <div class="info-row"><span class="info-label">Checked at</span><span class="info-value">{{ checkedAt }}</span></div>
          </div>
        </div>

        <div class="health-card" v-for="(value, name) in (health.checks || {})" :key="name">
          <h3>
            {{ name }}
            <span class="status-badge" :class="value">{{ value }}</span>
          </h3>
        </div>
      </div>
    </template>

    <!-- Disk Overview -->
    <template v-if="disks.length > 0">
      <div class="health-card wide">
        <h3>Disk Usage</h3>
        <div v-for="d in disks" :key="d.mount" class="disk-bar-container">
          <div class="disk-bar-header">
            <span class="disk-bar-label">{{ d.label }}</span>
            <span class="disk-label">{{ d.used_gb }} / {{ d.total_gb }} GB ({{ d.percent_used }}%)</span>
          </div>
          <div class="disk-bar">
            <div class="disk-bar-fill" :style="{ width: d.percent_used + '%' }"></div>
          </div>
        </div>
        <div class="disk-details">
          <div class="disk-stat">
            <span class="info-label">Images</span>
            <span class="info-value">{{ images.total_count }} ({{ formatMB(images.total_size_mb) }})</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Containers. Each card also carries the nightly usage rollup's line and,
         where the server says it can act, a Stop or Start control (system_3
         #10558; design c65900, security c65887, design_conventions §3.144).
         The control is absent, not disabled, where `controllable` is not true:
         the allowlist lives on the monitor and is never copied here. -->
    <template v-if="containers.length > 0">
      <div class="section-header">
        <h3>Containers</h3>
        <span class="container-count">{{ runningCount }} / {{ containers.length }} running</span>
        <span class="usage-as-of" data-test="usage-as-of">{{ usageHeader }}</span>
      </div>
      <p class="section-note">Services without a Stop button keep the cell running and can't be stopped from here.</p>
      <div class="container-grid">
        <div
          v-for="c in containers"
          :key="c.name"
          class="container-card"
          :class="{ stopped: c.status !== 'running' }"
          :data-test="`container-${c.name}`"
        >
          <div class="container-header">
            <span class="container-dot" :class="c.status === 'running' ? 'healthy' : 'unhealthy'"></span>
            <span class="container-name">{{ serviceName(c.name) }}</span>
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

          <!-- The image's size, not the container's disk: volumes keep their
               own section (D2), so this says IMAGE. -->
          <div v-if="c.disk_mb != null" class="metric-row image" data-test="container-image">
            <span class="metric-label">IMAGE</span>
            <span class="metric-value">{{ formatMB(c.disk_mb) }}</span>
          </div>

          <p v-if="usageLine(c)" class="usage-line" data-test="usage-line">{{ usageLine(c) }}</p>

          <div v-if="c.controllable === true" class="container-control">
            <AspButton
              v-if="c.status === 'running'"
              variant="secondary"
              :disabled="Boolean(busy(c).action)"
              data-test="container-stop"
              @click="askStop(c)"
            >
              {{ busy(c).action === 'stop' ? 'Stopping…' : 'Stop' }}
            </AspButton>
            <AspButton
              v-else
              variant="secondary"
              :disabled="Boolean(busy(c).action)"
              data-test="container-start"
              @click="control(c, 'start')"
            >
              {{ busy(c).action === 'start' ? 'Starting…' : 'Start' }}
            </AspButton>
            <p v-if="busy(c).caption" class="control-caption" data-test="control-caption">{{ busy(c).caption }}</p>
            <p v-if="busy(c).error" class="control-error" role="alert" data-test="control-error">{{ busy(c).error }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Stop asks first, naming the service and what stops working; Start is
         the undo and asks nothing (security c65887). The usage line is in the
         dialog so the evidence is in front of her when she decides. -->
    <AspModal
      :open="Boolean(stopTarget)"
      :title="stopTarget ? `Stop ${serviceName(stopTarget.name)}?` : 'Stop?'"
      size="sm"
      @update:open="(open) => (open ? null : (stopTarget = null))"
    >
      <!-- Test hook on the body: AspModal's root is a <Teleport>. -->
      <div v-if="stopTarget" data-test="stop-confirm">
        <p>
          {{ serviceName(stopTarget.name) }} will be unreachable until you start it again. It stays stopped
          until you start it here or until the next deploy.
        </p>
        <p v-if="usageLine(stopTarget)" class="confirm-usage">{{ usageLine(stopTarget) }}</p>
      </div>
      <template #footer>
        <AspButton variant="secondary" data-test="stop-cancel" @click="stopTarget = null">Cancel</AspButton>
        <AspButton variant="destructive" data-test="stop-confirm-button" @click="confirmStop">
          {{ stopTarget ? `Stop ${serviceName(stopTarget.name)}` : 'Stop' }}
        </AspButton>
      </template>
    </AspModal>

    <!-- Volumes -->
    <template v-if="volumes.length > 0">
      <div class="health-card wide">
        <h3>Volumes</h3>
        <div class="info-rows">
          <div v-for="v in volumes" :key="v.name" class="info-row info-row--volume">
            <span class="info-label mono">{{ v.name }}</span>
            <!-- A directory monitor cannot enter has no honest size; say so
                 rather than print a dash or a 0 (system_3 #10568, c65612). -->
            <span v-if="v.unreadable" class="info-value info-value--unreadable" data-test="volume-unreadable">monitor can't read it</span>
            <span v-else class="info-value">{{ formatMB(v.size_mb) }}</span>
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

    <AspButton class="btn-refresh" variant="secondary" @click="fetchAll">Refresh</AspButton>
  </div>
</template>

<script>
import axios from 'axios';
import ReadState from '../../components/ReadState.vue';
import { AspButton, AspModal } from '@aspirant/design-system';

// The rollup's readable service name for a container, by the same rule as
// aspirant-server's serviceNameFromContainer (handlers/service_usage_rollup.go):
// this cell's compose project prefix and instance suffix come off, and a name
// that does not match keeps its raw form rather than being mangled. Calls
// still use the raw container name.
const CONTAINER_NAME = /^aspirant-online-(.+)-\d+$/;
export function serviceNameFromContainer(name) {
  const m = CONTAINER_NAME.exec(name || '');
  return m ? m[1] : name;
}

// After a 202, the status word comes only from a re-read of /containers, never
// from the click (D2): every 2 s, for up to 30 s.
const POLL_EVERY_MS = 2000;
const POLL_FOR_MS = 30000;

const DAY = { day: 'numeric', month: 'short', timeZone: 'UTC' };
const formatDay = (iso) => new Date(iso).toLocaleDateString('en-GB', DAY);

export default {
  components: {
    AspButton,
    AspModal,
    ReadState,
  },
  data() {
    return {
      loading: true,
      error: null,
      health: null,
      checkedAt: '',
      containers: [],
      disks: [],
      volumes: [],
      images: { total_count: 0, total_size_mb: 0 },
      dbStats: null,
      refreshInterval: null,
      // The latest nightly rollup run (GET /system/service-usage). `read` is
      // false until a read answers, so a failed read says nothing rather than
      // "no requests".
      usage: { read: false, asOf: null, services: [] },
      // Per container name: { action: 'stop'|'start'|null, caption, error }.
      controls: {},
      stopTarget: null,
    };
  },
  computed: {
    // One computed block. There were two, and an object literal keeps only
    // the last key of a name, so runningCount was silently dropped and the
    // header read " / 14 running" (system_3 #10558).
    runningCount() {
      return this.containers.filter(c => c.status === 'running').length;
    },
    usageByService() {
      const by = {};
      for (const row of this.usage.services) {
        if (row.kind === 'container') by[row.service_name] = row;
      }
      return by;
    },
    usageHeader() {
      if (!this.usage.read) return '';
      return this.usage.asOf ? `Usage as of ${formatDay(this.usage.asOf)}` : 'No usage read yet';
    },
    // Four-way, and the order matters: a page that is refreshing on its 30s
    // timer already has data, so `loading` only wins on the first read. `empty`
    // is reachable in principle (every endpoint answers, none has anything to
    // say) and must not look like the failure above it.
    readState() {
      if (this.loading) return 'loading';
      if (this.error) return 'failed';
      if (!this.health && !this.containers.length && !this.disks.length && !this.dbStats) return 'empty';
      return 'ready';
    },
  },
  methods: {
    formatMB(mb) {
      if (mb == null) return '—';
      if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
      return mb.toFixed(1) + ' MB';
    },
    serviceName(name) {
      return serviceNameFromContainer(name);
    },
    // One line, dates only (security c64843). Null is "no signal", never a
    // false "never used" (D2). Feature rows have no container and are not shown.
    usageLine(c) {
      if (!this.usage.read || !this.usage.asOf) return '';
      const row = this.usageByService[serviceNameFromContainer(c.name)];
      if (!row || row.request_count == null) return 'No usage signal for this service';
      if (row.request_count === 0 || !row.last_used_at) return 'No requests in the last 30 days';
      const n = row.request_count;
      let line = `Last used ${formatDay(row.last_used_at)} · ${n.toLocaleString('en-GB')} ${n === 1 ? 'request' : 'requests'} in 30 days`;
      if (row.request_count_member != null) line += `, ${row.request_count_member.toLocaleString('en-GB')} by members`;
      return line;
    },
    busy(c) {
      return this.controls[c.name] || { action: null, caption: '', error: '' };
    },
    askStop(c) {
      this.stopTarget = c;
    },
    confirmStop() {
      const c = this.stopTarget;
      this.stopTarget = null;
      if (c) this.control(c, 'stop');
    },
    // Words keyed on the server's error code, never err.message (c65900).
    controlError(err, action) {
      const res = err && err.response;
      const code = res && res.data && res.data.error && res.data.error.code;
      const didnt = `The ${action} didn't go through`;
      if (!res) return `${didnt}: the monitor didn't answer.`;
      if (code === 'control_disabled') return "Start and stop aren't set up on this cell yet.";
      if (code === 'not_controllable') return "This service can't be started or stopped from here.";
      // monitor_auth_failed is #10641's mapping of the monitor's 401; a bare
      // 401 is the same fault before that lands.
      if (code === 'monitor_auth_failed' || res.status === 401) return "The monitor refused the server's credentials.";
      if (res.status === 404) return 'No container by that name now. Refresh the page.';
      if (code === 'docker_error') return `${didnt}: Docker refused it.`;
      if (res.status === 502 || res.status === 503 || res.status === 504) return `${didnt}: the monitor didn't answer.`;
      return `${didnt}. Refresh to check.`;
    },
    async readContainers() {
      try {
        const res = await axios.get('/api/system/containers');
        this.containers = res.data.containers || [];
      } catch (err) {
        console.error('Container re-read failed:', err);
      }
    },
    async control(c, action) {
      const name = c.name;
      if (this.busy(c).action) return;
      const before = c.status;
      this.controls[name] = { action, caption: '', error: '' };
      try {
        await axios.post(`/api/system/containers/${encodeURIComponent(name)}/${action}`);
      } catch (err) {
        this.controls[name] = { action: null, caption: '', error: this.controlError(err, action) };
        await this.readContainers();
        return;
      }
      const deadline = Date.now() + POLL_FOR_MS;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
        await this.readContainers();
        const now = this.containers.find((x) => x.name === name);
        if (!now || now.status !== before) {
          this.controls[name] = { action: null, caption: '', error: '' };
          return;
        }
        if (Date.now() >= deadline) {
          const verb = action === 'stop' ? 'Stop' : 'Start';
          this.controls[name] = {
            action: null,
            caption: `${verb} sent; the monitor still reports ${now.status}. Refresh to check.`,
            error: '',
          };
          return;
        }
      }
    },
    async fetchAll() {
      this.loading = this.disks.length === 0;
      this.error = null;
      try {
        const [healthRes, containersRes, diskRes, dbRes, usageRes] = await Promise.allSettled([
          axios.get('/api/health'),
          axios.get('/api/system/containers'),
          axios.get('/api/system/disk'),
          axios.get('/api/system/db-stats'),
          axios.get('/api/system/service-usage'),
        ]);

        if (healthRes.status === 'fulfilled') {
          // `/health` serves `{status, service, checks}` flat — read live at
          // 2026-09-06T04:52Z. It has never served the commit/uptime/memory
          // fields this page's cards were written against: `misc.go:14-18`
          // records them being dropped from this unauthenticated surface under
          // CWE-200 (#3865), and names this file as a reader of fields it does
          // not serve. Reading `.data.data` therefore left `health` undefined
          // and the whole banner block silently unrendered in production
          // (#5312). Reading the flat body renders what is actually served;
          // the rows for the unserved fields are gone rather than printing
          // `undefined MB` at an operator.
          this.health = healthRes.value.data;
          this.checkedAt = new Date().toLocaleTimeString();
        }

        if (containersRes.status === 'fulfilled') {
          this.containers = containersRes.value.data.containers || [];
        }

        if (diskRes.status === 'fulfilled') {
          this.disks = diskRes.value.data.disks || [];
          this.volumes = diskRes.value.data.volumes || [];
          this.images = diskRes.value.data.images || { total_count: 0, total_size_mb: 0 };
        }

        if (dbRes.status === 'fulfilled') {
          this.dbStats = dbRes.value.data.data;
        }

        // `{status, data: {as_of, services}}`; `as_of: null` before the first
        // nightly run. A failed read leaves the last good one in place.
        if (usageRes.status === 'fulfilled') {
          const d = (usageRes.value.data && usageRes.value.data.data) || {};
          this.usage = { read: true, asOf: d.as_of || null, services: d.services || [] };
        }

        // Show error only if all requests failed. The usage read is an
        // addition to the containers, not a page of its own, so it does not
        // count toward "nothing answered".
        const allFailed = [healthRes, containersRes, diskRes, dbRes].every(r => r.status === 'rejected');
        if (allFailed) {
          this.error = 'all-endpoints-failed';
        }
      } catch (err) {
        // The transport detail goes to the console, where it helps; the page
        // says what happened in words the operator can act on (#5302).
        console.error('System health fetch failed unexpectedly:', err);
        this.error = 'unexpected';
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
/* The shell's .app-main carries the one gutter and .page the one title y
   (system_3 #9192, #9501): no root padding, no 100vh box (it scrolled 64 px
   past the content), nothing centred at page level (§3.114). */
.system-health-view {
  width: 100%;
  max-width: 900px;
  margin: 0;
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

/* `ok` is what the server actually sends — `{"status":"ok"}`, read live
   2026-09-06T04:52Z. Only `healthy` and `degraded` were styled, so the banner
   has been rendering as bare unstyled text for the one value it receives: no
   box, no border, no dot. It looked deliberate in the frame and was not.
   `unknown` is the guarded fallback added with #5317 and gets the muted
   treatment on purpose — an unrecognised status is not a healthy one. */
.status-banner.ok {
  background-color: var(--surface-elevated);
  border: 2px solid var(--feedback-success);
  color: var(--feedback-success);
}

.status-banner.unknown {
  background-color: var(--surface-elevated);
  border: 2px solid var(--border-subtle);
  color: var(--text-muted);
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

.status-dot.ok {
  background-color: var(--feedback-success);
}

.status-dot.unknown {
  background-color: var(--text-muted);
}

/* Health Grid */
.health-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
  width: 100%;
  margin-bottom: var(--space-lg);
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

/* Shared card styles */
/* The card is dark in both themes, so it owns its own ink (§3.18) instead of
   inheriting the page's: --text-muted derives from currentColor, and with no
   color set here that was the page ink, #424242, which is the card's own
   colour in light theme (system_3 #10578). */
.health-card {
  background-color: var(--surface-card);
  color: var(--text-on-dark);
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
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* Disk bar */
.disk-bar-container {
  margin-bottom: var(--space-md);
}

.disk-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2xs);
}

.disk-bar-label {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-weight: 600;
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

.usage-as-of {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-left: auto;
}

.section-note {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-md) 0;
}

.usage-line {
  color: var(--text-muted);
  font-size: var(--text-xs);
  margin: var(--space-xs) 0 0 0;
}

/* The control sits at the card foot, on the card's own content gutter. */
.container-control {
  margin-top: var(--space-md);
}

.control-caption,
.control-error {
  font-size: var(--text-xs);
  margin: var(--space-xs) 0 0 0;
}

.control-caption {
  color: var(--text-muted);
}

/* The card is dark in both themes (§3.18). */
.control-error {
  color: var(--feedback-error-text-on-dark, var(--feedback-error));
}

.confirm-usage {
  color: var(--text-muted);
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
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
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

.info-value--unreadable {
  color: var(--text-muted);
  white-space: nowrap;
}

/* A volume row that cannot fit its path and its value on one line puts the
   value on the next line, right-aligned, so neither breaks mid-word (390px,
   c65622). */
.info-row--volume {
  flex-wrap: wrap;
  column-gap: var(--space-sm);
}

.info-row--volume .info-value {
  margin-left: auto;
}

.info-row--volume .info-label {
  color: var(--text-muted);
  overflow-wrap: anywhere;
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
/* Layout only — visuals from AspButton (variant="secondary"). */
.btn-refresh {
  margin-top: var(--space-md);
}

/* Mobile */
@media (max-width: 768px) {
  .health-grid {
    grid-template-columns: 1fr;
  }

  .container-grid {
    grid-template-columns: 1fr;
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

/* Below 640px the control takes the card's full width (§3.114). */
@media (max-width: 639px) {
  .container-control :deep(button) {
    width: 100%;
  }

  .section-header {
    flex-wrap: wrap;
  }
}
</style>
