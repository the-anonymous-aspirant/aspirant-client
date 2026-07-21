<template>
  <div class="assets-view">
    <h1>Assets</h1>
    <h2 class="page-subtitle">Files stored in asset storage</h2>

    <div class="toolbar">
      <div class="breadcrumbs">
        <span class="crumb" :class="{ active: currentPath === '' }" @click="navigateTo('')">Root</span>
        <template v-for="(segment, i) in pathSegments" :key="i">
          <span class="crumb-sep">/</span>
          <span class="crumb" :class="{ active: i === pathSegments.length - 1 }" @click="navigateTo(pathSegments.slice(0, i + 1).join('/'))">
            {{ segment }}
          </span>
        </template>
      </div>
      <div class="toolbar-actions">
        <label class="btn btn-upload" for="asset-upload">Upload</label>
        <input id="asset-upload" type="file" class="file-input-hidden" @change="onFileSelected" />
      </div>
    </div>

    <div v-if="message" :class="['message', message.type]">{{ message.text }}</div>

    <div v-if="uploading" class="upload-bar">
      <span>Uploading {{ uploadFileName }}...</span>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th @click="sortTable('name')" class="sortable">
              Name {{ sortIndicator('name') }}
            </th>
            <th @click="sortTable('last_modified')" class="sortable">
              Modified {{ sortIndicator('last_modified') }}
            </th>
            <th @click="sortTable('size')" class="sortable">
              Size {{ sortIndicator('size') }}
            </th>
            <th @click="sortTable('content_type')" class="sortable">
              Type {{ sortIndicator('content_type') }}
            </th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="currentPath !== ''" class="row-folder" @click="navigateUp">
            <td colspan="5" class="folder-name">..</td>
          </tr>
          <tr v-for="folder in sortedFolders" :key="'d-' + folder" class="row-folder" @click="navigateTo(currentPath ? currentPath + '/' + folder : folder)">
            <td class="folder-name">{{ folder }}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr v-for="file in sortedFiles" :key="file.etag">
            <td class="file-name">{{ fileName(file.key) }}</td>
            <td>{{ formatDate(file.last_modified) }}</td>
            <td class="nowrap">{{ formatSize(file.size) }}</td>
            <td class="mono">{{ file.content_type }}</td>
            <td class="col-actions">
              <button class="btn-icon btn-download" @click="downloadAsset(file)" title="Download">
                <span>&#8615;</span>
              </button>
              <button class="btn-icon btn-delete" @click="confirmDelete(file)" title="Delete">
                <span>&times;</span>
              </button>
            </td>
          </tr>
          <tr v-if="sortedFolders.length === 0 && sortedFiles.length === 0">
            <td colspan="5" class="empty-state">No files in this folder</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="stats">{{ totalFiles }} files, {{ formatSize(totalSize) }} total</div>

    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal">
        <h3>Delete asset?</h3>
        <p class="modal-path">{{ deleteTarget.key }}</p>
        <p>This cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn btn-cancel" @click="deleteTarget = null">Cancel</button>
          <button class="btn btn-confirm-delete" @click="deleteAsset">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    data() {
      return {
        assets: [],
        currentPath: '',
        sortKey: 'name',
        sortOrder: 'asc',
        message: null,
        uploading: false,
        uploadFileName: '',
        deleteTarget: null,
      };
    },
    created() {
      this.fetchAssets();
    },
    computed: {
      pathSegments() {
        return this.currentPath ? this.currentPath.split('/') : [];
      },
      currentEntries() {
        const prefix = this.currentPath ? this.currentPath + '/' : '';
        return this.assets.filter(a => a.key.startsWith(prefix));
      },
      foldersAndFiles() {
        const prefix = this.currentPath ? this.currentPath + '/' : '';
        const folders = new Set();
        const files = [];

        for (const asset of this.currentEntries) {
          const rest = asset.key.slice(prefix.length);
          const slashIndex = rest.indexOf('/');
          if (slashIndex !== -1) {
            folders.add(rest.slice(0, slashIndex));
          } else {
            files.push(asset);
          }
        }

        return { folders: [...folders].sort(), files };
      },
      sortedFolders() {
        return this.foldersAndFiles.folders;
      },
      sortedFiles() {
        const files = [...this.foldersAndFiles.files];
        return files.sort((a, b) => {
          let valA, valB;
          if (this.sortKey === 'name') {
            valA = this.fileName(a.key).toLowerCase();
            valB = this.fileName(b.key).toLowerCase();
          } else {
            valA = a[this.sortKey];
            valB = b[this.sortKey];
          }
          let result = 0;
          if (valA < valB) result = -1;
          else if (valA > valB) result = 1;
          return this.sortOrder === 'asc' ? result : -result;
        });
      },
      totalFiles() {
        return this.assets.length;
      },
      totalSize() {
        return this.assets.reduce((sum, a) => sum + a.size, 0);
      },
    },
    methods: {
      async fetchAssets() {
        try {
          const response = await axios.get('/api/assets');
          this.assets = response.data.assets || [];
        } catch (error) {
          this.showMessage('error', 'Failed to load assets');
        }
      },
      navigateTo(path) {
        this.currentPath = path;
      },
      navigateUp() {
        const segments = this.pathSegments;
        segments.pop();
        this.currentPath = segments.join('/');
      },
      fileName(key) {
        return key.split('/').pop();
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
      async onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.uploading = true;
        this.uploadFileName = file.name;
        this.message = null;

        const uploadPath = this.currentPath ? this.currentPath + '/' + file.name : file.name;
        const formData = new FormData();
        formData.append('image', file);
        formData.append('path', uploadPath);

        try {
          await axios.post('/api/assets/upload', formData);
          this.showMessage('success', `Uploaded ${file.name}`);
          await this.fetchAssets();
        } catch (error) {
          this.showMessage('error', error.response?.data?.error?.message || 'Upload failed');
        } finally {
          this.uploading = false;
          event.target.value = '';
        }
      },
      downloadAsset(file) {
        // Same-origin fetch sends the server's HttpOnly auth_token cookie by
        // default; no Authorization header and no credentials option needed.
        fetch('/api/fetch-object/' + file.etag)
          .then(res => res.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.fileName(file.key);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          })
          .catch(() => this.showMessage('error', 'Download failed'));
      },
      confirmDelete(file) {
        this.deleteTarget = file;
      },
      async deleteAsset() {
        const file = this.deleteTarget;
        this.deleteTarget = null;

        try {
          await axios.delete('/api/assets', { params: { key: file.key } });
          this.showMessage('success', `Deleted ${this.fileName(file.key)}`);
          await this.fetchAssets();
        } catch (error) {
          this.showMessage('error', error.response?.data?.error?.message || 'Delete failed');
        }
      },
      showMessage(type, text) {
        this.message = { type, text };
        setTimeout(() => { this.message = null; }, 4000);
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
    margin-bottom: var(--space-lg);
  }

  /* Toolbar */
  .toolbar {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-wrap: wrap;
    font-size: var(--text-sm);
  }

  .crumb {
    cursor: pointer;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--radius-sm);
    color: var(--text-on-light);
    transition: background-color var(--transition-fast);
  }

  .crumb:hover {
    background-color: var(--border-subtle);
  }

  .crumb.active {
    font-weight: 600;
    color: var(--brand-primary-hover);
    cursor: default;
  }

  .crumb.active:hover {
    background-color: transparent;
  }

  .crumb-sep {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .toolbar-actions {
    display: flex;
    gap: var(--space-xs);
    flex-shrink: 0;
  }

  /* Buttons */
  .btn {
    padding: var(--space-xs) var(--space-md);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
    transition: filter var(--transition-fast), transform var(--transition-fast);
  }

  .btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .btn-upload {
    background-color: var(--feedback-success);
    color: #fff;
  }

  .file-input-hidden {
    display: none;
  }

  /* Messages */
  .message {
    width: 100%;
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    margin-bottom: var(--space-sm);
  }

  .message.success {
    background: #d4edda;
    color: #155724;
  }

  .message.error {
    background: #f8d7da;
    color: #721c24;
  }

  .upload-bar {
    width: 100%;
    padding: var(--space-xs) var(--space-md);
    background: #cfe2ff;
    color: #084298;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    margin-bottom: var(--space-sm);
  }

  /* Table */
  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border: 1px solid var(--border-subtle);
    padding: var(--space-xs) var(--space-sm);
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

  .col-actions {
    width: 80px;
    text-align: center;
  }

  /* Rows */
  .row-folder {
    cursor: pointer;
  }

  .row-folder:hover td {
    background-color: rgba(255, 179, 0, 0.08);
  }

  .folder-name {
    font-weight: 600;
    color: var(--brand-primary-hover);
  }

  .folder-name::before {
    content: '\1F4C1  ';
  }

  .file-name::before {
    content: '\1F4C4  ';
  }

  .mono {
    font-family: monospace;
    font-size: var(--text-xs);
  }

  .nowrap {
    white-space: nowrap;
  }

  .empty-state {
    text-align: center;
    color: var(--text-muted);
    padding: var(--space-xl);
    font-style: italic;
  }

  /* Icon buttons */
  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--text-lg);
    line-height: 1;
    padding: var(--space-2xs);
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
  }

  .btn-icon:hover {
    background-color: var(--border-subtle);
  }

  .btn-download {
    color: var(--brand-accent);
  }

  .btn-delete {
    color: var(--feedback-error);
  }

  /* Stats */
  .stats {
    width: 100%;
    text-align: right;
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-top: var(--space-xs);
  }

  /* Modal */
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
    background: var(--surface-elevated);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  .modal h3 {
    margin: 0 0 var(--space-sm) 0;
    color: var(--text-on-light);
  }

  .modal-path {
    font-family: monospace;
    font-size: var(--text-xs);
    background: #f0f0f0;
    padding: var(--space-xs);
    border-radius: var(--radius-sm);
    word-break: break-all;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }

  .btn-cancel {
    background: var(--border-subtle);
    color: var(--text-on-light);
  }

  .btn-confirm-delete {
    background: var(--feedback-error);
    color: #fff;
  }

  @media (max-width: 768px) {
    .assets-view {
      padding: var(--space-md) var(--space-sm);
    }

    .toolbar {
      flex-direction: column;
      align-items: flex-start;
    }

    th,
    td {
      padding: var(--space-2xs) var(--space-xs);
      font-size: var(--text-xs);
    }
  }
</style>
