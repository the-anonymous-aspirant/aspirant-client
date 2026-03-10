<template>
  <div class="s3-assets-view">
    <h1>S3 Assets</h1>
    <h2 class="page-subtitle">Files stored in the S3 bucket</h2>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th @click="sortTable('Key')" class="sortable">
              Filename {{ sortIndicator('Key') }}
            </th>
            <th @click="sortTable('Key')" class="sortable">
              Path {{ sortIndicator('Key') }}
            </th>
            <th @click="sortTable('ETag')" class="sortable">
              ETag {{ sortIndicator('ETag') }}
            </th>
            <th @click="sortTable('LastModified')" class="sortable">
              Date Uploaded {{ sortIndicator('LastModified') }}
            </th>
            <th @click="sortTable('Size')" class="sortable">
              Size {{ sortIndicator('Size') }}
            </th>
            <th @click="sortTable('StorageClass')" class="sortable">
              Storage Class {{ sortIndicator('StorageClass') }}
            </th>
            <th @click="sortTable('FileType')" class="sortable">
              Filetype {{ sortIndicator('FileType') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="asset in sortedAssets" :key="asset.ETag">
            <td>{{ asset.Key.split('/').pop() }}</td>
            <td class="mono">{{ asset.Key }}</td>
            <td class="mono">{{ asset.ETag }}</td>
            <td>{{ formatDate(asset.LastModified) }}</td>
            <td>{{ formatSize(asset.Size) }}</td>
            <td>{{ asset.StorageClass }}</td>
            <td>{{ getFileType(asset.Key) }}</td>
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
        sortKey: 'LastModified',
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
          if (this.sortKey === 'FileType') {
            valA = this.getFileType(a.Key);
            valB = this.getFileType(b.Key);
          }
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
          const response = await axios.get('/api/s3-assets');
          this.assets = response.data.assets;
        } catch (error) {
          console.error('Failed to fetch S3 assets:', error);
        }
      },
      getFileType(key) {
        const ext = key.split('.').pop().toLowerCase();
        const types = {
          jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image',
          mp3: 'Audio', wav: 'Audio',
          mp4: 'Video', mov: 'Video',
          pdf: 'Document', doc: 'Document', docx: 'Document',
        };
        return types[ext] || 'Other';
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
  .s3-assets-view {
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
    .s3-assets-view {
      padding: var(--space-md);
    }
  }
</style>
