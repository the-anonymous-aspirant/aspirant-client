<template>
  <div class="finance-view">
    <h1>Finance</h1>
    <h2 class="page-subtitle">Personal finance tracker</h2>

    <!-- Overview Cards -->
    <div class="overview-cards" v-if="overview">
      <div class="stat-card">
        <div class="stat-value">{{ overview.total_transactions.toLocaleString() }}</div>
        <div class="stat-label">Transactions</div>
      </div>
      <div class="stat-card income">
        <div class="stat-value">{{ formatAmount(overview.total_income) }} EUR</div>
        <div class="stat-label">Income (excl. transfers)</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-value">{{ formatAmount(overview.total_expenses) }} EUR</div>
        <div class="stat-label">Expenses (excl. transfers)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ overview.banks.length }}</div>
        <div class="stat-label">Banks</div>
      </div>
    </div>

    <!-- Sources — folder-per-source with drag-and-drop -->
    <div class="section">
      <h3>Bank Sources</h3>
      <div class="sources-grid">
        <div
          v-for="s in sources"
          :key="s.bank"
          class="source-folder"
          :class="{ 'drag-over': dragOverBank === s.bank, 'uploading': uploadingBank === s.bank }"
          @dragover.prevent="onDragOver(s.bank)"
          @dragleave.prevent="onDragLeave(s.bank)"
          @drop.prevent="onDrop($event, s.bank)"
        >
          <div class="folder-header">
            <div class="folder-icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
            </div>
            <div class="folder-title">{{ s.name || s.bank.toUpperCase() }}</div>
            <button class="btn-icon" @click="showSchema(s.bank)" title="View expected CSV schema">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
            </button>
          </div>

          <div class="folder-stats">
            <span class="folder-count">{{ s.transaction_count.toLocaleString() }} transactions</span>
            <span class="folder-currency" v-if="s.currency">{{ s.currency }}</span>
          </div>
          <div class="folder-date" v-if="s.last_transaction_date">Last: {{ s.last_transaction_date }}</div>

          <div class="drop-zone">
            <div v-if="uploadingBank === s.bank" class="drop-label uploading-label">
              Uploading...
            </div>
            <div v-else class="drop-label">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="upload-icon">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              Drop CSV here or <label class="file-link" :for="'file-' + s.bank">browse</label>
            </div>
            <input
              type="file"
              :id="'file-' + s.bank"
              :ref="'fileInput-' + s.bank"
              accept=".csv"
              class="hidden-input"
              @change="onFileSelect($event, s.bank)"
            />
          </div>

          <div v-if="uploadResults[s.bank]" class="folder-result" :class="uploadResults[s.bank].error ? 'error' : 'success'">
            {{ uploadResults[s.bank].message }}
          </div>
        </div>
      </div>
    </div>

    <!-- Schema Modal -->
    <div class="modal-overlay" v-if="schemaModal" @click.self="schemaModal = null">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ schemaModal.name }} — CSV Schema</h3>
          <button class="btn-icon" @click="schemaModal = null">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="schema-meta">
            <p v-if="schemaModal.description">{{ schemaModal.description }}</p>
            <div class="schema-props">
              <span><strong>Encoding:</strong> {{ schemaModal.encoding }}</span>
              <span><strong>Delimiter:</strong> <code>{{ schemaModal.delimiter }}</code></span>
              <span><strong>Currency:</strong> {{ schemaModal.currency }}</span>
            </div>
          </div>

          <table class="schema-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Description</th>
                <th>Aliases</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="col in schemaModal.columns" :key="col.name">
                <td><code>{{ col.name }}</code></td>
                <td><span :class="col.required ? 'badge-required' : 'badge-optional'">{{ col.required ? 'Required' : 'Optional' }}</span></td>
                <td>{{ col.description }}</td>
                <td>
                  <span v-if="col.aliases && col.aliases.length">
                    <code v-for="(a, i) in col.aliases" :key="a">{{ a }}<span v-if="i < col.aliases.length - 1">, </span></code>
                  </span>
                  <span v-else class="text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="schemaModal.sample_row" class="schema-sample">
            <strong>Example row:</strong>
            <code class="sample-code">{{ schemaModal.sample_row }}</code>
          </div>

          <div v-if="schemaModal.notes" class="schema-notes">
            <strong>Notes:</strong> {{ schemaModal.notes }}
          </div>
        </div>
      </div>
    </div>

    <!-- Active Filter Bar -->
    <div class="filter-bar" v-if="hasActiveFilters">
      <span class="filter-bar-label">Active filters:</span>
      <span v-if="chartFilter && chartFilter.type === 'year'" class="filter-chip" @click="clearChartFilter">
        Year: {{ chartFilter.value }} <span class="chip-x">&times;</span>
      </span>
      <span v-if="chartFilter && chartFilter.type === 'month'" class="filter-chip" @click="clearChartFilter">
        Month: {{ chartFilter.value }} <span class="chip-x">&times;</span>
      </span>
      <span v-if="chartFilter && chartFilter.type === 'category'" class="filter-chip" @click="clearChartFilter">
        Category: {{ chartFilter.value }} <span class="chip-x">&times;</span>
      </span>
      <span v-if="filterBank" class="filter-chip" @click="removeFilter('bank')">
        Bank: {{ filterBank.toUpperCase() }} <span class="chip-x">&times;</span>
      </span>
      <span v-if="filterSearch" class="filter-chip" @click="removeFilter('search')">
        Search: "{{ filterSearch }}" <span class="chip-x">&times;</span>
      </span>
      <button class="btn-clear-all" @click="clearAllFilters">Clear all</button>
    </div>

    <!-- Filters -->
    <div class="section">
      <h3>Transactions</h3>
      <div class="filters-row">
        <select v-model="filterBank" @change="resetAndLoad" class="select-input">
          <option value="">All banks</option>
          <option v-for="s in sources" :key="s.bank" :value="s.bank">{{ s.name || s.bank.toUpperCase() }}</option>
        </select>
        <select v-model="filterCategory" @change="resetAndLoad" class="select-input">
          <option value="">All categories</option>
          <option v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <input type="date" v-model="filterDateFrom" @change="resetAndLoad" class="date-input" />
        <input type="date" v-model="filterDateTo" @change="resetAndLoad" class="date-input" />
        <input type="text" v-model="filterSearch" @input="debounceSearch" placeholder="Search..." class="text-input" />
      </div>

      <!-- Transaction Table -->
      <div class="table-container">
        <table v-if="transactions.items.length">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Amount (EUR)</th>
              <th>Original</th>
              <th>Category</th>
              <th>Bank</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in transactions.items" :key="t.id">
              <td>{{ t.transaction_date }}</td>
              <td>{{ t.normalized_payee || t.payee }}</td>
              <td :class="t.flow_direction">{{ formatAmount(t.amount_eur || t.amount) }}</td>
              <td v-if="t.currency !== 'EUR'" class="text-muted">{{ formatAmount(t.amount) }} {{ t.currency }}</td>
              <td v-else></td>
              <td><span class="category-tag">{{ t.category || 'other' }}</span></td>
              <td>{{ t.source_bank.toUpperCase() }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">No transactions found.</div>
      </div>

      <!-- Pagination -->
      <div class="pagination" v-if="transactions.total > pageSize">
        <button @click="prevPage" :disabled="currentPage <= 1" class="btn btn-sm">Previous</button>
        <span class="page-info">Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage >= totalPages" class="btn btn-sm">Next</button>
      </div>
    </div>

    <!-- Charts -->
    <div class="section" v-if="monthlyData.length">
      <h3>Spending Analysis</h3>
      <div class="chart-controls">
        <select v-model="chartCategory" @change="renderCharts()" class="select-input">
          <option value="">All Categories</option>
          <option v-for="cat in chartableCategories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <label class="toggle-label">
          <input type="checkbox" v-model="excludeInternalTransfers" @change="renderCharts()" />
          Exclude internal transfers
        </label>
      </div>

      <h4>Last 12 Months</h4>
      <div class="chart-container">
        <canvas ref="recentChartCanvas" height="300"></canvas>
      </div>

      <h4>Year-over-Year Expenses</h4>
      <div class="chart-container">
        <canvas ref="yoyExpenseCanvas" height="350"></canvas>
      </div>

      <h4>Year-over-Year Income</h4>
      <div class="chart-container">
        <canvas ref="yoyIncomeCanvas" height="350"></canvas>
      </div>

      <h4>Expenses by Category (Last 12 Months)</h4>
      <div class="chart-container pie-container">
        <canvas ref="categoryPieCanvas" height="350"></canvas>
      </div>
    </div>

    <!-- Top Outliers -->
    <div class="section" v-if="outliers">
      <h3>Notable Transactions</h3>
      <div class="outliers-grid">
        <div class="outlier-col" v-if="outliers.top_expenses.length">
          <h4>Largest Expenses</h4>
          <table class="recurring-table">
            <thead><tr><th>Date</th><th>Payee</th><th>Amount (EUR)</th><th>Category</th></tr></thead>
            <tbody>
              <tr v-for="(t, i) in outliers.top_expenses" :key="'exp-' + i">
                <td class="text-muted">{{ t.transaction_date }}</td>
                <td>{{ t.payee }}</td>
                <td class="expense">{{ formatAmount(Math.abs(t.amount_eur)) }}</td>
                <td><span class="category-tag">{{ t.category || 'other' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="outlier-col" v-if="outliers.top_income.length">
          <h4>Largest Income</h4>
          <table class="recurring-table">
            <thead><tr><th>Date</th><th>Payee</th><th>Amount (EUR)</th><th>Category</th></tr></thead>
            <tbody>
              <tr v-for="(t, i) in outliers.top_income" :key="'inc-' + i">
                <td class="text-muted">{{ t.transaction_date }}</td>
                <td>{{ t.payee }}</td>
                <td class="income">{{ formatAmount(t.amount_eur) }}</td>
                <td><span class="category-tag">{{ t.category || 'other' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="section">
      <h3>Actions</h3>
      <div class="actions-row">
        <button @click="importLocal" :disabled="importingLocal" class="btn btn-primary">
          {{ importingLocal ? 'Importing...' : 'Import Local CSVs' }}
        </button>
        <button @click="reEnrich" :disabled="reEnriching" class="btn btn-secondary">
          {{ reEnriching ? 'Re-enriching...' : 'Re-enrich All Transactions' }}
        </button>
      </div>
      <div v-if="importLocalResult" class="action-result-block" :class="importLocalResult.error ? 'error' : 'success'">
        <div>{{ importLocalResult.summary }}</div>
        <ul v-if="importLocalResult.files && importLocalResult.files.length" class="import-file-list">
          <li v-for="f in importLocalResult.files" :key="f.file">
            <strong>{{ f.bank }}/{{ f.file }}</strong>:
            <span v-if="f.error" class="text-error">{{ f.error }}</span>
            <span v-else>+{{ f.new_rows }} new, {{ f.skipped_rows }} skipped</span>
          </li>
        </ul>
      </div>
      <span v-if="reEnrichResult" class="action-result">{{ reEnrichResult }}</span>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default {
  data() {
    return {
      overview: null,
      sources: [],
      transactions: { items: [], total: 0, page: 1, page_size: 20 },
      monthlyData: [],
      availableCategories: [],
      // Upload
      uploadingBank: null,
      uploadResults: {},
      dragOverBank: null,
      // Schema modal
      schemaModal: null,
      // Filters
      filterBank: '',
      filterCategory: '',
      filterDateFrom: '',
      filterDateTo: '',
      filterSearch: '',
      currentPage: 1,
      pageSize: 20,
      // Actions
      importingLocal: false,
      importLocalResult: null,
      reEnriching: false,
      reEnrichResult: '',
      // Outliers
      outliers: null,
      // Chart cross-filter
      chartFilter: null, // { type: 'month'|'category', value: string }
      // Charts
      recentChart: null,
      yoyExpenseChart: null,
      yoyIncomeChart: null,
      categoryPieChart: null,
      chartCategory: '',
      excludeInternalTransfers: true,
      searchTimeout: null,
    };
  },
  computed: {
    totalPages() {
      return Math.ceil(this.transactions.total / this.pageSize);
    },
    authHeaders() {
      const token = localStorage.getItem('user_token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    chartableCategories() {
      return this.availableCategories.filter(c => c !== 'internal_transfer' && c !== 'transfers');
    },
    internalCategories() {
      return ['internal_transfer', 'transfers'];
    },
    hasActiveFilters() {
      return !!(this.chartFilter || this.filterBank || this.filterSearch);
    },
  },
  methods: {
    async loadOverview() {
      try {
        const res = await axios.get('/api/finance/summary/overview', { headers: this.authHeaders });
        this.overview = res.data;
        this.availableCategories = res.data.categories || [];
      } catch (err) {
        console.error('Failed to load overview:', err);
      }
    },
    async loadSources() {
      try {
        const res = await axios.get('/api/finance/sources', { headers: this.authHeaders });
        this.sources = res.data;
      } catch (err) {
        console.error('Failed to load sources:', err);
      }
    },
    async loadTransactions() {
      try {
        const params = new URLSearchParams();
        params.set('page', this.currentPage);
        params.set('page_size', this.pageSize);
        if (this.filterBank) params.set('bank', this.filterBank);
        if (this.filterCategory) params.set('category', this.filterCategory);
        if (this.filterDateFrom) params.set('date_from', this.filterDateFrom);
        if (this.filterDateTo) params.set('date_to', this.filterDateTo);
        if (this.filterSearch) params.set('search', this.filterSearch);

        const res = await axios.get(`/api/finance/transactions?${params}`, { headers: this.authHeaders });
        this.transactions = res.data;
      } catch (err) {
        console.error('Failed to load transactions:', err);
      }
    },
    async loadOutliers() {
      try {
        const params = new URLSearchParams();
        if (this.filterBank) params.set('bank', this.filterBank);
        if (this.filterCategory) params.set('category', this.filterCategory);
        if (this.filterDateFrom) params.set('date_from', this.filterDateFrom);
        if (this.filterDateTo) params.set('date_to', this.filterDateTo);
        const qs = params.toString();
        const url = qs ? `/api/finance/summary/outliers?${qs}` : '/api/finance/summary/outliers';
        const res = await axios.get(url, { headers: this.authHeaders });
        this.outliers = res.data;
      } catch (err) {
        console.error('Failed to load outliers:', err);
      }
    },
    applyChartFilter(type, value) {
      // Toggle off if same filter clicked again
      if (this.chartFilter && this.chartFilter.type === type && this.chartFilter.value === value) {
        this.clearChartFilter();
        return;
      }
      this.chartFilter = { type, value };
      if (type === 'month') {
        const [y, m] = value.split('-');
        this.filterDateFrom = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        this.filterDateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
        this.filterCategory = '';
      } else if (type === 'category') {
        this.filterCategory = value;
        this.filterDateFrom = '';
        this.filterDateTo = '';
      } else if (type === 'year') {
        this.filterDateFrom = `${value}-01-01`;
        this.filterDateTo = `${value}-12-31`;
        this.filterCategory = '';
      }
      this.currentPage = 1;
      this.loadTransactions();
      this.loadOutliers();
      this.$nextTick(() => this.renderCharts());
    },
    clearChartFilter() {
      this.chartFilter = null;
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterCategory = '';
      this.currentPage = 1;
      this.loadTransactions();
      this.loadOutliers();
      this.$nextTick(() => this.renderCharts());
    },
    removeFilter(type) {
      if (type === 'bank') {
        this.filterBank = '';
      } else if (type === 'search') {
        this.filterSearch = '';
      }
      this.currentPage = 1;
      this.loadTransactions();
      this.loadOutliers();
      this.$nextTick(() => this.renderCharts());
    },
    clearAllFilters() {
      this.chartFilter = null;
      this.filterBank = '';
      this.filterCategory = '';
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterSearch = '';
      this.currentPage = 1;
      this.loadTransactions();
      this.loadOutliers();
      this.$nextTick(() => this.renderCharts());
    },
    async loadMonthly() {
      try {
        const res = await axios.get('/api/finance/summary/monthly', { headers: this.authHeaders });
        this.monthlyData = res.data;
        this.$nextTick(() => this.renderCharts());
      } catch (err) {
        console.error('Failed to load monthly data:', err);
      }
    },

    // --- Drag-and-drop + file select ---
    onDragOver(bank) {
      this.dragOverBank = bank;
    },
    onDragLeave(bank) {
      if (this.dragOverBank === bank) this.dragOverBank = null;
    },
    onDrop(event, bank) {
      this.dragOverBank = null;
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        this.uploadFile(files[0], bank);
      }
    },
    onFileSelect(event, bank) {
      const files = event.target.files;
      if (files && files.length > 0) {
        this.uploadFile(files[0], bank);
      }
      event.target.value = '';
    },
    async uploadFile(file, bank) {
      this.uploadingBank = bank;
      delete this.uploadResults[bank];

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await axios.post(`/api/finance/sources/${bank}/upload`, formData, {
          headers: { ...this.authHeaders, 'Content-Type': 'multipart/form-data' },
        });
        this.uploadResults[bank] = {
          error: false,
          message: `${res.data.new_rows} new, ${res.data.skipped_rows} skipped (${res.data.total_rows} total)`,
        };
        this.loadOverview();
        this.loadSources();
        this.loadTransactions();
        this.loadMonthly();
      } catch (err) {
        this.uploadResults[bank] = {
          error: true,
          message: `Failed: ${err.response?.data?.error?.message || err.message}`,
        };
      } finally {
        this.uploadingBank = null;
      }
    },

    // --- Schema modal ---
    async showSchema(bank) {
      try {
        const res = await axios.get(`/api/finance/sources/${bank}/schema`, { headers: this.authHeaders });
        this.schemaModal = res.data;
      } catch (err) {
        console.error('Failed to load schema:', err);
      }
    },

    // --- Actions ---
    async importLocal() {
      this.importingLocal = true;
      this.importLocalResult = null;
      try {
        const res = await axios.post('/api/finance/import-local', {}, { headers: this.authHeaders });
        this.importLocalResult = {
          error: false,
          summary: `Imported ${res.data.total_new} new transactions (${res.data.total_skipped} duplicates skipped) from ${res.data.files.length} file(s).`,
          files: res.data.files,
        };
        this.loadOverview();
        this.loadSources();
        this.loadTransactions();
        this.loadMonthly();
      } catch (err) {
        this.importLocalResult = {
          error: true,
          summary: `Import failed: ${err.response?.data?.error?.message || err.message}`,
          files: [],
        };
      } finally {
        this.importingLocal = false;
      }
    },
    async reEnrich() {
      this.reEnriching = true;
      this.reEnrichResult = '';
      try {
        const res = await axios.post('/api/finance/re-enrich', {}, { headers: this.authHeaders });
        this.reEnrichResult = `Updated ${res.data.updated} of ${res.data.total} transactions.`;
        this.loadOverview();
        this.loadTransactions();
        this.loadMonthly();
      } catch (err) {
        this.reEnrichResult = `Failed: ${err.message}`;
      } finally {
        this.reEnriching = false;
      }
    },

    // --- Helpers ---
    formatAmount(val) {
      if (val === null || val === undefined) return '-';
      return Number(val).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    resetAndLoad() {
      this.currentPage = 1;
      this.loadTransactions();
    },
    debounceSearch() {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.currentPage = 1;
        this.loadTransactions();
      }, 400);
    },
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadTransactions();
      }
    },
    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.loadTransactions();
      }
    },
    filterMonthlyData(skipYearFilter = false) {
      return this.monthlyData.filter(row => {
        if (this.excludeInternalTransfers && this.internalCategories.includes(row.category)) return false;
        if (this.chartCategory && row.category !== this.chartCategory) return false;
        if (this.chartFilter) {
          if (this.chartFilter.type === 'year' && !skipYearFilter) {
            if (!row.month.startsWith(this.chartFilter.value)) return false;
          } else if (this.chartFilter.type === 'month') {
            if (row.month !== this.chartFilter.value) return false;
          } else if (this.chartFilter.type === 'category') {
            if (row.category !== this.chartFilter.value) return false;
          }
        }
        return true;
      });
    },
    renderCharts() {
      this.renderRecentChart();
      this.renderYoyChart('expense');
      this.renderYoyChart('income');
      this.renderCategoryPie();
    },
    renderRecentChart() {
      if (!this.$refs.recentChartCanvas) return;
      if (this.recentChart) this.recentChart.destroy();

      const filtered = this.filterMonthlyData();
      if (!filtered.length) return;

      // Aggregate income and expenses per month
      const incomeMap = {};
      const expenseMap = {};
      for (const row of filtered) {
        if (row.flow_direction === 'income') {
          incomeMap[row.month] = (incomeMap[row.month] || 0) + Number(row.total_absolute);
        } else if (row.flow_direction === 'expense') {
          expenseMap[row.month] = (expenseMap[row.month] || 0) + Number(row.total_absolute);
        }
      }

      // Get last 12 months sorted
      const allMonths = [...new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)])].sort();
      const recent = allMonths.slice(-12);

      const vm = this;
      this.recentChart = new Chart(this.$refs.recentChartCanvas, {
        type: 'bar',
        data: {
          labels: recent,
          datasets: [
            {
              label: 'Income',
              data: recent.map(m => incomeMap[m] || 0),
              backgroundColor: 'rgba(40, 167, 69, 0.6)',
              borderColor: 'rgba(40, 167, 69, 1)',
              borderWidth: 1,
            },
            {
              label: 'Expenses',
              data: recent.map(m => expenseMap[m] || 0),
              backgroundColor: 'rgba(220, 53, 69, 0.6)',
              borderColor: 'rgba(220, 53, 69, 1)',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          onClick(event, elements) {
            if (elements.length > 0) {
              const idx = elements[0].index;
              vm.applyChartFilter('month', recent[idx]);
            }
          },
        },
      });
    },
    renderCategoryPie() {
      if (!this.$refs.categoryPieCanvas) return;
      if (this.categoryPieChart) this.categoryPieChart.destroy();

      const filtered = this.filterMonthlyData();
      if (!filtered.length) return;

      // Get last 12 months of expenses by category
      const allMonths = [...new Set(filtered.map(r => r.month))].sort();
      const recent12 = new Set(allMonths.slice(-12));

      const catTotals = {};
      for (const row of filtered) {
        if (row.flow_direction !== 'expense') continue;
        if (!recent12.has(row.month)) continue;
        const cat = row.category || 'other';
        catTotals[cat] = (catTotals[cat] || 0) + Number(row.total_absolute);
      }

      const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
      const labels = sorted.map(([cat]) => cat);
      const data = sorted.map(([, val]) => Math.round(val));

      const palette = [
        '#dc3545', '#007bff', '#28a745', '#ffc107', '#6f42c1', '#17a2b8',
        '#fd7e14', '#20c997', '#e83e8c', '#6610f2', '#343a40', '#adb5bd',
        '#795548', '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff',
      ];

      const pieVm = this;
      this.categoryPieChart = new Chart(this.$refs.categoryPieCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map((_, i) => palette[i % palette.length]),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 14, font: { size: 12 } } },
          },
          onClick(event, elements) {
            if (elements.length > 0) {
              const idx = elements[0].index;
              pieVm.applyChartFilter('category', labels[idx]);
            }
          },
        },
      });
    },
    renderYoyChart(direction) {
      const isExpense = direction === 'expense';
      const canvasRef = isExpense ? 'yoyExpenseCanvas' : 'yoyIncomeCanvas';
      const chartProp = isExpense ? 'yoyExpenseChart' : 'yoyIncomeChart';

      if (!this.$refs[canvasRef]) return;
      if (this[chartProp]) this[chartProp].destroy();

      // Skip year filter so YoY still shows all years
      const filtered = this.filterMonthlyData(true);
      if (!filtered.length) return;

      const yearData = {};
      for (const row of filtered) {
        if (row.flow_direction !== direction) continue;
        const [year, monthNum] = row.month.split('-');
        if (!yearData[year]) yearData[year] = {};
        yearData[year][monthNum] = (yearData[year][monthNum] || 0) + Number(row.total_absolute);
      }

      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthNums = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      const years = Object.keys(yearData).sort();
      const baseColor = isExpense ? [220, 53, 69] : [40, 167, 69];
      const totalYears = years.length;
      const currentYear = String(new Date().getFullYear());
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      const selectedYear = this.chartFilter?.type === 'year' ? this.chartFilter.value : null;

      const vm = this;
      const datasets = years.map((year, i) => {
        const age = totalYears - 1 - i;
        const isSelected = selectedYear === year;
        const isDimmed = selectedYear && !isSelected;
        const opacity = isDimmed ? 0.1 : (age === 0 ? 1.0 : Math.max(0.15, 0.6 - age * 0.12));
        const lineWidth = isSelected ? 3.5 : (isDimmed ? 1 : (age === 0 ? 3 : Math.max(1, 2 - age * 0.3)));
        const radius = isSelected ? 5 : (isDimmed ? 0 : (age === 0 ? 4 : Math.max(1, 2.5 - age * 0.5)));
        const [r, g, b] = baseColor;
        return {
          label: year,
          data: monthNums.map(m => {
            if (year === currentYear && m > currentMonth) return null;
            return yearData[year][m] || 0;
          }),
          borderColor: `rgba(${r}, ${g}, ${b}, ${opacity})`,
          backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity * 0.1})`,
          fill: false,
          tension: 0.3,
          borderWidth: lineWidth,
          pointRadius: radius,
          spanGaps: false,
        };
      });

      this[chartProp] = new Chart(this.$refs[canvasRef], {
        type: 'line',
        data: { labels: monthLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              onClick(e, legendItem) {
                vm.applyChartFilter('year', years[legendItem.datasetIndex]);
              },
            },
          },
          onClick(event, elements) {
            if (elements.length > 0) {
              vm.applyChartFilter('year', years[elements[0].datasetIndex]);
            }
          },
        },
      });
    },
  },
  mounted() {
    this.loadOverview();
    this.loadSources();
    this.loadTransactions();
    this.loadMonthly();
    this.loadOutliers();
  },
  beforeUnmount() {
    if (this.recentChart) this.recentChart.destroy();
    if (this.yoyExpenseChart) this.yoyExpenseChart.destroy();
    if (this.yoyIncomeChart) this.yoyIncomeChart.destroy();
    if (this.categoryPieChart) this.categoryPieChart.destroy();
  },
};
</script>

<style scoped>
.finance-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xl);
}

/* Overview cards */
.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-md);
  width: 100%;
  margin-bottom: var(--space-xl);
}

.stat-card {
  background: var(--bg-card, #fff);
  border-radius: 8px;
  padding: var(--space-lg);
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: var(--space-xs);
}

.stat-label {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.stat-card.income .stat-value { color: #28a745; }
.stat-card.expense .stat-value { color: #dc3545; }

/* Section layout */
.section {
  width: 100%;
  margin-bottom: var(--space-xl);
}

.section h3 {
  margin-bottom: var(--space-md);
}

/* Source folder cards */
.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-lg);
}

.source-folder {
  background: var(--bg-card, #fff);
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  padding: var(--space-lg);
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.source-folder.drag-over {
  border-color: var(--color-primary, #007bff);
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15);
  background: rgba(0, 123, 255, 0.03);
}

.source-folder.uploading {
  opacity: 0.7;
  pointer-events: none;
}

.folder-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.folder-icon {
  color: var(--color-primary, #007bff);
  flex-shrink: 0;
}

.folder-title {
  font-weight: 700;
  font-size: 1.1rem;
  flex: 1;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  transition: color 0.15s, background 0.15s;
}

.btn-icon:hover {
  color: var(--color-primary, #007bff);
  background: rgba(0,123,255,0.08);
}

.folder-stats {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 2px;
}

.folder-count {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.folder-currency {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-card, #e9ecef);
  color: var(--text-muted);
  font-weight: 600;
}

.folder-date {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: var(--space-sm);
}

.drop-zone {
  border: 2px dashed var(--border-color, #ccc);
  border-radius: 8px;
  padding: var(--space-md);
  text-align: center;
  transition: border-color 0.2s;
  margin-top: var(--space-sm);
}

.drag-over .drop-zone {
  border-color: var(--color-primary, #007bff);
}

.drop-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.uploading-label {
  color: var(--color-primary, #007bff);
  font-weight: 600;
}

.upload-icon {
  opacity: 0.5;
}

.file-link {
  color: var(--color-primary, #007bff);
  cursor: pointer;
  text-decoration: underline;
}

.hidden-input {
  display: none;
}

.folder-result {
  margin-top: var(--space-sm);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.folder-result.success {
  background: #d4edda;
  color: #155724;
}

.folder-result.error {
  background: #f8d7da;
  color: #721c24;
}

/* Schema modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--border-color, #eee);
}

.modal-header h3 {
  margin: 0;
}

.modal-body {
  padding: var(--space-lg);
}

.schema-meta {
  margin-bottom: var(--space-lg);
}

.schema-meta p {
  margin: 0 0 var(--space-sm) 0;
  color: var(--text-muted);
}

.schema-props {
  display: flex;
  gap: var(--space-lg);
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.schema-props code {
  background: var(--bg-card, #f0f0f0);
  padding: 1px 5px;
  border-radius: 3px;
}

.schema-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  margin-bottom: var(--space-lg);
}

.schema-table th,
.schema-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #eee);
}

.schema-table th {
  font-weight: 600;
  background: var(--bg-card, #f8f9fa);
}

.schema-table code {
  background: var(--bg-card, #f0f0f0);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.85rem;
}

.badge-required {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 8px;
  background: #dc3545;
  color: #fff;
  font-weight: 600;
}

.badge-optional {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--bg-card, #e9ecef);
  color: var(--text-muted);
  font-weight: 600;
}

.schema-sample {
  margin-bottom: var(--space-md);
  font-size: 0.9rem;
}

.sample-code {
  display: block;
  margin-top: var(--space-xs);
  padding: 8px 12px;
  background: var(--bg-card, #f5f5f5);
  border-radius: 4px;
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: nowrap;
}

.schema-notes {
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: var(--space-sm) var(--space-md);
  background: #fff3cd;
  border-radius: 4px;
}

.text-muted {
  color: var(--text-muted, #999);
}

/* Filters */
.filters-row {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: var(--space-md);
}

.select-input, .date-input, .text-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bg-input, #fff);
  color: var(--text-on-light);
}

/* Buttons */
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-primary {
  background: var(--color-primary, #007bff);
  color: #fff;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-secondary, #6c757d);
  color: #fff;
}

.btn-sm {
  padding: 4px 12px;
  font-size: 0.85rem;
  background: var(--bg-card, #f0f0f0);
  border: 1px solid var(--border-color, #ccc);
}

/* Transaction table */
.table-container {
  overflow-x: auto;
  width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th, td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #eee);
}

th {
  font-weight: 600;
  background: var(--bg-card, #f8f9fa);
}

td.income { color: #28a745; }
td.expense { color: #dc3545; }

.category-tag {
  background: var(--bg-card, #e9ecef);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.empty-state {
  text-align: center;
  padding: var(--space-xl);
  color: var(--text-muted);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.page-info {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.actions-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.action-result {
  margin-left: var(--space-md);
  font-size: 0.9rem;
}

.action-result-block {
  padding: var(--space-sm) var(--space-md);
  border-radius: 6px;
  font-size: 0.9rem;
  margin-bottom: var(--space-md);
}

.action-result-block.success {
  background: #d4edda;
  color: #155724;
}

.action-result-block.error {
  background: #f8d7da;
  color: #721c24;
}

.import-file-list {
  margin: var(--space-xs) 0 0 var(--space-md);
  padding: 0;
  list-style: disc;
  font-size: 0.85rem;
}

.text-error {
  color: #dc3545;
}

/* Chart controls */
.chart-controls {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.chart-container {
  position: relative;
  width: 100%;
  margin-bottom: var(--space-lg);
}

.section h4 {
  margin: var(--space-sm) 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

.pie-container {
  max-width: 600px;
}

/* Outlier tables */
.recurring-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.recurring-table th,
.recurring-table td {
  padding: 6px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #eee);
}

.recurring-table th {
  font-weight: 600;
  background: var(--bg-card, #f8f9fa);
}

.total-row td {
  border-top: 2px solid var(--border-color, #ccc);
  padding-top: 8px;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  width: 100%;
  padding: 8px 14px;
  margin-bottom: var(--space-lg);
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #1565c0;
}

.filter-bar-label {
  font-weight: 600;
  margin-right: 2px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #fff;
  border: 1px solid #90caf9;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.filter-chip:hover {
  background: #bbdefb;
}

.chip-x {
  font-size: 1.1em;
  font-weight: 700;
  line-height: 1;
}

.btn-clear-all {
  margin-left: auto;
  background: none;
  border: 1px solid #90caf9;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 0.8rem;
  color: #1565c0;
  cursor: pointer;
}

.btn-clear-all:hover {
  background: #bbdefb;
}

/* Outliers */
.outliers-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.outlier-col h4 {
  margin-bottom: var(--space-sm);
}

@media (max-width: 767px) {
  .finance-view {
    padding: var(--space-md) var(--space-sm);
  }
  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .sources-grid {
    grid-template-columns: 1fr;
  }
  .filters-row {
    flex-direction: column;
    align-items: stretch;
  }
  .schema-props {
    flex-direction: column;
    gap: var(--space-xs);
  }
  .outliers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
