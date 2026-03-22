<template>
  <div class="assets-view">
    <h1>Assets</h1>
    <h2 class="page-subtitle">Files stored in asset storage</h2>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th @click="sortTable('key')" class="sortable">
              Filename {{ sortIndicator('key') }}
            </th>
            <th @click="sortTable('key')" class="sortable">
              Path {{ sortIndicator('key') }}
            </th>
            <th @click="sortTable('etag')" class="sortable">
              Hash {{ sortIndicator('etag') }}
            </th>
            <th @click="sortTable('last_modified')" class="sortable">
              Date Modified {{ sortIndicator('last_modified') }}
            </th>
            <th @click="sortTable('size')" class="sortable">
              Size {{ sortIndicator('size') }}
            </th>
            <th @click="sortTable('content_type')" class="sortable">
              Content Type {{ sortIndicator('content_type') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="asset in sortedAssets" :key="asset.etag">
            <td>{{ asset.key.split('/').pop() }}</td>
            <td class="mono">{{ asset.key }}</td>
            <td class="mono">{{ asset.etag }}</td>
            <td>{{ formatDate(asset.last_modified) }}</td>
            <td>{{ formatSize(asset.size) }}</td>
            <td class="mono">{{ asset.content_type }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    data() {
      return {
        assets: [],
        sortKey: 'last_modified',
        sortOrder: 'desc',
      };
    },
    created() {
      this.fetchAssets();
    },
    computed: {
      sortedAssets() {
        return [...this.assets].sort((a, b) => {
          let valA = a[this.sortKey];
          let valB = b[this.sortKey];
          let result = 0;
          if (valA < valB) result = -1;
          else if (valA > valB) result = 1;
          return this.sortOrder === 'asc' ? result : -result;
        });
      },
    },
    methods: {
      async fetchAssets() {
        try {
          const response = await axios.get('/api/assets');
          this.assets = response.data.assets;
        } catch (error) {
          console.error('Failed to fetch assets:', error);
        }
      },
      sortTable(key) {
        if (this.sortKey === key) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortKey = key;
          this.sortOrder = 'asc';
        }
      },
      sortIndicator(key) {
        if (this.sortKey !== key) return '';
        return this.sortOrder === 'asc' ? '\u25B2' : '\u25BC';
      },
      formatDate(dateString) {
        return new Date(Date.parse(dateString)).toLocaleDateString();
      },
      formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      },
    },
  };
</script>

<style scoped>
  .assets-view {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
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

  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--space-lg);
  }

  th,
  td {
    border: 1px solid var(--border-subtle);
    padding: var(--space-xs);
    text-align: left;
    font-size: var(--text-sm);
  }

  th {
    background-color: var(--surface-elevated);
    color: var(--text-on-light);
    font-weight: 600;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
    transition: background-color var(--transition-fast);
  }

  th.sortable:hover {
    background-color: var(--border-subtle);
  }

  .mono {
    font-family: monospace;
    font-size: var(--text-xs);
    word-break: break-all;
  }

  @media (max-width: 768px) {
    .assets-view {
      padding: var(--space-md);
    }
  }
</style>
