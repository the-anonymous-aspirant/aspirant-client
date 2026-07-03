<template>
  <div class="jobs-view">
    <h1>Jobs</h1>
    <p class="page-subtitle">
      Berlin · part-time · English-speaking — deduplicated overview across the scraped boards.
    </p>

    <details class="sources-panel" data-test="sources-panel">
      <summary class="sources-panel-summary" data-test="sources-panel-summary">
        <span>Sources &amp; criteria</span>
        <span v-if="sourcesLoadError" class="sources-status error">{{ sourcesLoadError }}</span>
        <span v-else-if="sourcesLoading" class="sources-status muted">Laddar…</span>
        <span v-else class="sources-status muted">
          {{ sources.length }} source{{ sources.length === 1 ? '' : 's' }}
        </span>
      </summary>

      <div v-if="globalCriteria" class="sources-panel-body">
        <div class="global-criteria" data-test="sources-global-criteria">
          <div class="criteria-row">
            <span class="criteria-label">Distance ceiling</span>
            <span class="criteria-value">≤ {{ globalCriteria.max_distance_km }} km</span>
          </div>
          <div class="criteria-row">
            <span class="criteria-label">English</span>
            <span class="criteria-value">{{ globalCriteria.english_required ? 'required' : 'not required' }}</span>
          </div>
          <div class="criteria-row criteria-keywords">
            <span class="criteria-label">Keywords (whitelist)</span>
            <span class="criteria-value keyword-pills">
              <span
                v-for="kw in globalCriteria.whitelist_keywords"
                :key="'w-' + kw"
                class="keyword-pill keyword-pill-whitelist"
              >{{ kw }}</span>
            </span>
          </div>
          <div class="criteria-row criteria-keywords">
            <span class="criteria-label">Keywords (blacklist)</span>
            <span class="criteria-value keyword-pills">
              <span
                v-for="kw in globalCriteria.blacklist_keywords"
                :key="'b-' + kw"
                class="keyword-pill keyword-pill-blacklist"
              >{{ kw }}</span>
            </span>
          </div>
          <div class="criteria-row criteria-heuristic">
            <span class="criteria-label">English heuristic</span>
            <span class="criteria-value muted">{{ globalCriteria.english_heuristic }}</span>
          </div>
        </div>

        <table v-if="sources.length" class="sources-table" data-test="sources-table">
          <thead>
            <tr>
              <th class="src-col-name">Source</th>
              <th class="src-col-desc">Scope</th>
              <th class="src-col-proxy">Proxy</th>
              <th class="src-col-run">Last run</th>
              <th class="src-col-count">Rows</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="src in sources"
              :key="src.source"
              :data-test-source="src.source"
            >
              <td class="src-col-name">
                <a
                  v-if="src.board_url"
                  :href="src.board_url"
                  target="_blank"
                  rel="noopener"
                  class="src-name-link"
                >{{ src.source }}</a>
                <span v-else>{{ src.source }}</span>
              </td>
              <td class="src-col-desc">
                <span v-if="src.description">{{ src.description }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="src-col-proxy">
                <span v-if="src.proxy" class="badge badge-proxy">{{ src.proxy }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="src-col-run">
                <span v-if="src.last_run_at">
                  <span
                    class="badge"
                    :class="src.last_run_status === 'success' ? 'badge-run-ok' : 'badge-run-fail'"
                  >{{ src.last_run_status || 'unknown' }}</span>
                  <span class="run-time">{{ formatRelative(src.last_run_at) }}</span>
                </span>
                <span v-else class="muted">never</span>
              </td>
              <td class="src-col-count">{{ src.row_count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="sources-empty muted" data-test="sources-empty">
          No scraper flows are registered.
        </p>
      </div>
      <div v-else-if="!sourcesLoading && !sourcesLoadError" class="sources-panel-body">
        <p class="sources-empty muted">Loading criteria…</p>
      </div>
    </details>

    <div class="tab-strip" data-test="jobs-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'all' }"
        data-test="jobs-tab-all"
        @click="setTab('all')"
      >
        All
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: tab === 'saved' }"
        data-test="jobs-tab-saved"
        @click="setTab('saved')"
      >
        Saved
      </button>
    </div>

    <div class="filter-bar">
      <input
        v-model="query"
        type="search"
        placeholder="Filter by title, company, or description…"
        class="filter-input"
        data-test="jobs-filter"
        @input="onQueryInput"
      />
      <span v-if="loading" class="filter-status">Laddar…</span>
      <span v-else-if="loadError" class="filter-status error">{{ loadError }}</span>
      <span v-else class="filter-status muted">{{ total }} hits</span>
    </div>

    <div class="table-wrap">
      <table class="jobs-table" data-test="jobs-table">
        <thead>
          <tr>
            <th class="col-title">Title</th>
            <th class="col-source">Source</th>
            <th
              class="col-distance sortable"
              :class="{ active: sort === 'distance' }"
              data-test="sort-distance"
              @click="setSort('distance')"
            >
              Distance
            </th>
            <th
              class="col-salary sortable"
              :class="{ active: sort === 'salary' }"
              data-test="sort-salary"
              @click="setSort('salary')"
            >
              Salary
            </th>
            <th
              class="col-scraped sortable"
              :class="{ active: sort === 'scraped_at' }"
              data-test="sort-scraped"
              @click="setSort('scraped_at')"
            >
              Scraped
            </th>
            <th class="col-action"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loading && !jobs.length">
            <td colspan="6" class="empty-cell" data-test="jobs-empty">
              <span v-if="loadError">—</span>
              <span v-else-if="query">No jobs match “{{ query }}”.</span>
              <span v-else-if="tab === 'saved'">No saved jobs yet — press <em>Save</em> on a row to add one.</span>
              <span v-else>No jobs in the feed yet — the scrapers may not have run.</span>
            </td>
          </tr>
          <tr
            v-for="job in jobs"
            :key="job.id"
            :data-test-row-id="job.id"
          >
            <td class="col-title">
              <div class="title-cell">
                <div class="title-line">
                  <a class="title-link" :href="job.canonical_url" target="_blank" rel="noopener">{{ job.title }}</a>
                  <span v-if="job.seen_on_sites_count > 1" class="badge badge-sites" :title="`Seen on ${job.seen_on_sites_count} sites`">
                    ×{{ job.seen_on_sites_count }}
                  </span>
                </div>
                <div class="row-meta">
                  <template v-if="job.company || job.description_excerpt">
                    <span v-if="job.company" class="company">{{ job.company }}</span>
                    <span v-if="job.company && job.description_excerpt" class="meta-sep">·</span>
                    <span v-if="job.description_excerpt" class="excerpt">{{ job.description_excerpt }}</span>
                  </template>
                  <span v-else class="muted">—</span>
                </div>
              </div>
            </td>
            <td class="col-source">
              <span class="badge badge-source">{{ job.source }}</span>
            </td>
            <td class="col-distance">
              <span v-if="job.distance_km !== null && job.distance_km !== undefined" class="badge badge-distance">
                {{ formatDistance(job.distance_km) }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="col-salary">{{ formatSalary(job) }}</td>
            <td class="col-scraped">{{ formatScraped(job.scraped_at) }}</td>
            <td class="col-action">
              <div class="action-buttons">
                <button
                  type="button"
                  class="btn-action btn-save"
                  :class="{ saved: !!job.saved_at }"
                  :disabled="actingIds.has(job.id) || !!job.saved_at"
                  :data-test-save="job.id"
                  @click="onSave(job)"
                >
                  <span v-if="actingIds.has(job.id)">…</span>
                  <span v-else-if="job.saved_at">Saved ✓</span>
                  <span v-else>Save</span>
                </button>
                <button
                  type="button"
                  class="btn-action btn-hide"
                  :disabled="actingIds.has(job.id)"
                  :data-test-hide="job.id"
                  @click="onHide(job)"
                >
                  <span v-if="actingIds.has(job.id)">…</span>
                  <span v-else>Not interested</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination" data-test="jobs-pagination">
      <button type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">‹ Prev</button>
      <span class="page-indicator">Page {{ page }} of {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">Next ›</button>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';

  const PER_PAGE = 25;
  const FILTER_DEBOUNCE_MS = 300;

  function formatRelative(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    return `${months}mo ago`;
  }

  export default {
    name: 'JobsView',
    data() {
      return {
        jobs: [],
        total: 0,
        page: 1,
        perPage: PER_PAGE,
        sort: 'distance',
        tab: 'all',
        query: '',
        loading: false,
        loadError: null,
        actingIds: new Set(),
        debounceTimer: null,
        sources: [],
        globalCriteria: null,
        sourcesLoading: false,
        sourcesLoadError: null,
      };
    },
    computed: {
      totalPages() {
        if (!this.total) return 1;
        return Math.max(1, Math.ceil(this.total / this.perPage));
      },
    },
    methods: {
      formatDistance(km) {
        if (km < 1) return `${Math.round(km * 1000)} m`;
        if (km < 10) return `${km.toFixed(1)} km`;
        return `${Math.round(km)} km`;
      },
      formatSalary(job) {
        const min = job.salary_min;
        const max = job.salary_max;
        if (min === null && max === null) return '—';
        const cur = job.currency || '';
        const fmt = (n) => `${Math.round(n).toLocaleString('en-GB')}${cur ? ' ' + cur : ''}`;
        if (min !== null && max !== null && max !== min) return `${fmt(min)} – ${fmt(max)}`;
        return fmt(min ?? max);
      },
      formatScraped(iso) {
        return formatRelative(iso);
      },
      setSort(next) {
        if (this.sort === next) return;
        this.sort = next;
        this.page = 1;
        this.fetchJobs();
      },
      setTab(next) {
        if (this.tab === next) return;
        this.tab = next;
        this.page = 1;
        this.fetchJobs();
      },
      changePage(next) {
        if (next < 1 || next > this.totalPages) return;
        this.page = next;
        this.fetchJobs();
      },
      onQueryInput() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.page = 1;
          this.fetchJobs();
        }, FILTER_DEBOUNCE_MS);
      },
      async fetchJobs() {
        this.loading = true;
        this.loadError = null;
        try {
          const params = {
            sort: this.sort,
            page: this.page,
            per_page: this.perPage,
          };
          if (this.query.trim()) params.q = this.query.trim();
          if (this.tab === 'saved') params.filter = 'saved';
          const resp = await axios.get('/api/jobs', { params });
          this.jobs = resp.data.jobs || [];
          this.total = resp.data.total ?? 0;
        } catch (err) {
          this.loadError =
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            err.message ||
            'Could not fetch jobs';
          this.jobs = [];
          this.total = 0;
        } finally {
          this.loading = false;
        }
      },
      async onSave(job) {
        if (this.actingIds.has(job.id)) return;
        this.actingIds.add(job.id);
        try {
          const resp = await axios.patch(`/api/jobs/${job.id}/save`);
          const updated = resp.data;
          const idx = this.jobs.findIndex((j) => j.id === job.id);
          if (idx >= 0) {
            this.jobs.splice(idx, 1, { ...this.jobs[idx], ...updated });
          }
        } catch (err) {
          this.loadError =
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            err.message ||
            'Could not save row';
        } finally {
          this.actingIds.delete(job.id);
        }
      },
      formatRelative(iso) {
        return formatRelative(iso);
      },
      async fetchSources() {
        this.sourcesLoading = true;
        this.sourcesLoadError = null;
        try {
          const resp = await axios.get('/api/jobs/sources');
          this.sources = resp.data.sources || [];
          this.globalCriteria = resp.data.global_criteria || null;
        } catch (err) {
          this.sourcesLoadError =
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            err.message ||
            'Could not fetch sources';
          this.sources = [];
          this.globalCriteria = null;
        } finally {
          this.sourcesLoading = false;
        }
      },
      async onHide(job) {
        if (this.actingIds.has(job.id)) return;
        this.actingIds.add(job.id);
        try {
          await axios.patch(`/api/jobs/${job.id}/hide`);
          this.jobs = this.jobs.filter((j) => j.id !== job.id);
          this.total = Math.max(0, this.total - 1);
          if (!this.jobs.length && this.page > 1) {
            this.page -= 1;
          }
          if (!this.jobs.length) {
            this.fetchJobs();
          }
        } catch (err) {
          this.loadError =
            err.response?.data?.error?.message ||
            err.response?.data?.detail ||
            err.message ||
            'Could not hide row';
        } finally {
          this.actingIds.delete(job.id);
        }
      },
    },
    mounted() {
      this.fetchJobs();
      this.fetchSources();
    },
    beforeUnmount() {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
    },
  };
</script>

<style scoped>
  .jobs-view {
    padding: var(--space-lg);
    max-width: 1100px;
    margin: 0 auto;
  }

  .page-subtitle {
    color: var(--text-muted, #888);
    margin-bottom: var(--space-md);
  }

  .sources-panel {
    margin-bottom: var(--space-md);
    border: 1px solid var(--border-card, #444);
    border-radius: var(--radius-sm, 4px);
    background-color: var(--surface-card, transparent);
  }

  .sources-panel-summary {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    font-weight: 500;
    user-select: none;
    list-style: none;
  }

  .sources-panel-summary::before {
    content: '▸';
    font-size: var(--text-sm);
    color: var(--text-muted, #888);
    transition: transform 120ms ease;
    display: inline-block;
  }

  .sources-panel[open] > .sources-panel-summary::before {
    transform: rotate(90deg);
  }

  .sources-status {
    margin-left: auto;
    font-size: var(--text-sm);
    font-weight: 400;
  }

  .sources-status.error {
    color: var(--text-error, #c00);
  }

  .sources-status.muted {
    color: var(--text-muted, #888);
  }

  .sources-panel-body {
    padding: var(--space-sm) var(--space-md) var(--space-md);
    border-top: 1px solid var(--border-card, #333);
  }

  .global-criteria {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-xs) var(--space-md);
    align-items: baseline;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px dashed var(--border-card, #333);
  }

  .criteria-row {
    display: contents;
  }

  .criteria-label {
    font-size: var(--text-sm);
    color: var(--text-muted, #888);
    white-space: nowrap;
  }

  .criteria-value {
    font-size: var(--text-sm);
  }

  .criteria-value.muted {
    color: var(--text-muted, #888);
    font-style: italic;
  }

  .keyword-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .keyword-pill {
    display: inline-block;
    padding: 2px 6px;
    font-size: var(--text-xs, 11px);
    border-radius: var(--radius-sm, 4px);
    font-family: var(--font-mono, monospace);
    background-color: var(--surface-input, rgba(255,255,255,0.05));
  }

  .keyword-pill-whitelist {
    border: 1px solid rgba(102, 204, 102, 0.5);
    color: inherit;
  }

  .keyword-pill-blacklist {
    border: 1px solid rgba(204, 102, 102, 0.5);
    color: inherit;
  }

  .sources-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .sources-table th,
  .sources-table td {
    text-align: left;
    padding: var(--space-xs) var(--space-sm);
    border-bottom: 1px solid var(--border-card, #333);
    vertical-align: top;
  }

  .sources-table th {
    color: var(--text-muted, #888);
    font-weight: 500;
  }

  .sources-table .src-col-name {
    white-space: nowrap;
  }

  .sources-table .src-col-count {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .sources-table .src-name-link {
    color: inherit;
    text-decoration: underline dotted;
  }

  .badge-proxy {
    display: inline-block;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 4px);
    font-size: var(--text-xs, 11px);
    background-color: var(--surface-input, rgba(255,255,255,0.05));
    border: 1px solid var(--border-card, #444);
  }

  .badge-run-ok {
    display: inline-block;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 4px);
    font-size: var(--text-xs, 11px);
    background-color: rgba(102, 204, 102, 0.15);
    color: inherit;
    border: 1px solid rgba(102, 204, 102, 0.5);
  }

  .badge-run-fail {
    display: inline-block;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 4px);
    font-size: var(--text-xs, 11px);
    background-color: rgba(204, 102, 102, 0.15);
    color: inherit;
    border: 1px solid rgba(204, 102, 102, 0.5);
  }

  .run-time {
    margin-left: var(--space-xs, 4px);
    color: var(--text-muted, #888);
  }

  .sources-empty {
    margin: 0;
    padding: var(--space-sm) 0;
  }

  .tab-strip {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
    border-bottom: 1px solid var(--border-card, #333);
  }

  .tab-btn {
    padding: var(--space-xs) var(--space-md);
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-muted, #888);
    font-size: var(--text-base);
    cursor: pointer;
    margin-bottom: -1px;
  }

  .tab-btn:hover {
    color: inherit;
  }

  .tab-btn.active {
    color: inherit;
    border-bottom-color: var(--brand-accent, #6cf);
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .filter-input {
    flex: 1;
    padding: var(--space-sm);
    font-size: var(--text-base);
    border: 1px solid var(--border-card, #444);
    border-radius: var(--radius-sm, 4px);
    background-color: var(--surface-input, transparent);
    color: inherit;
  }

  .filter-status {
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .filter-status.error {
    color: var(--text-error, #c00);
  }

  .filter-status.muted {
    color: var(--text-muted, #888);
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-card, #444);
    border-radius: var(--radius-sm, 4px);
  }

  .jobs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    table-layout: fixed;
  }

  .jobs-table th,
  .jobs-table td {
    text-align: left;
    padding: var(--space-sm);
    border-bottom: 1px solid var(--border-card, #333);
    vertical-align: middle;
    overflow: hidden;
  }

  .jobs-table tbody tr {
    height: 80px;
  }

  .jobs-table th {
    font-weight: 600;
    background-color: var(--surface-card, transparent);
    position: sticky;
    top: 0;
  }

  .col-title { width: 40%; }
  .col-source { width: 12%; }
  .col-distance { width: 10%; }
  .col-salary { width: 12%; }
  .col-scraped { width: 10%; }
  .col-action { width: 16%; }

  .jobs-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .jobs-table th.sortable:hover {
    color: var(--brand-accent, #6cf);
  }

  .jobs-table th.sortable.active {
    color: var(--brand-accent, #6cf);
  }

  .title-cell {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2xs);
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }

  .title-link {
    font-weight: 600;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    line-height: 1.3;
    max-height: 2.6em;
    min-width: 0;
    flex: 1 1 auto;
  }

  .row-meta {
    font-size: var(--text-xs);
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .meta-sep {
    margin: 0 var(--space-2xs);
  }

  .col-source,
  .col-salary,
  .col-scraped {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-distance {
    background-color: var(--badge-distance-bg, #1f3a5f);
    color: var(--badge-distance-fg, #cfe0ff);
  }

  .badge-source {
    background-color: var(--badge-source-bg, #1f5f3a);
    color: var(--badge-source-fg, #cfffd0);
  }

  .badge-sites {
    background-color: var(--badge-sites-bg, #3a1f5f);
    color: var(--badge-sites-fg, #e0cfff);
    flex: 0 0 auto;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    align-items: stretch;
  }

  .btn-action {
    padding: var(--space-2xs) var(--space-sm);
    background-color: transparent;
    border: 1px solid var(--border-card, #444);
    border-radius: var(--radius-sm, 4px);
    color: inherit;
    cursor: pointer;
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .btn-action:hover:not(:disabled) {
    background-color: var(--surface-hover, rgba(255, 255, 255, 0.05));
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-save {
    border-color: var(--brand-accent, #6cf);
    color: var(--brand-accent, #6cf);
  }

  .empty-cell {
    text-align: center;
    padding: var(--space-xl);
    color: var(--text-muted, #888);
  }

  .muted {
    color: var(--text-muted, #888);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    margin-top: var(--space-md);
  }

  .pagination button {
    padding: var(--space-xs) var(--space-sm);
    background-color: transparent;
    border: 1px solid var(--border-card, #444);
    border-radius: var(--radius-sm, 4px);
    color: inherit;
    cursor: pointer;
  }

  .pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator {
    font-size: var(--text-sm);
    color: var(--text-muted, #888);
  }

  @media (max-width: 767px) {
    .jobs-view {
      padding: var(--space-md) var(--space-sm);
    }

    .filter-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .col-source,
    .col-scraped {
      display: none;
    }

    .col-title { width: 44%; }
    .col-distance { width: 14%; }
    .col-salary { width: 16%; }
    .col-action { width: 26%; }
  }
</style>
