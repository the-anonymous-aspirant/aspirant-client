<template>
  <div class="files-manager">
    <h1>Files</h1>
    <h2 class="page-subtitle">Upload, download, and share files</h2>

    <!-- Admin storage usage panel -->
    <div v-if="isAdmin && storageUsage" class="storage-panel">
      <h3>Storage Usage</h3>
      <p class="storage-total">
        Total: {{ formatSize(storageUsage.total_size) }} across {{ storageUsage.total_files }} files
      </p>
      <table>
        <thead>
          <tr>
            <th>Folder</th>
            <th>Files</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="folder in storageUsage.folders" :key="folder.name">
            <td>{{ folder.name }}</td>
            <td>{{ folder.file_count }}</td>
            <td>{{ formatSize(folder.total_size) }} / {{ formatSize(folderLimit(folder.name)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'my' }"
        @click="switchTab('my')"
      >
        My Files
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'shared' }"
        @click="switchTab('shared')"
      >
        Shared Files
      </button>
    </div>

    <!-- Breadcrumb navigation -->
    <div v-if="currentPath" class="breadcrumbs">
      <span class="breadcrumb-link" @click="navigateTo('')">Root</span>
      <span v-for="(segment, index) in pathSegments" :key="index">
        <span class="breadcrumb-separator"> &gt; </span>
        <span
          class="breadcrumb-link"
          :class="{ 'breadcrumb-current': index === pathSegments.length - 1 }"
          @click="navigateTo(pathSegments.slice(0, index + 1).join('/'))"
        >{{ segment }}</span>
      </span>
    </div>

    <div class="upload-section">
      <label class="btn btn-upload" for="file-input">
        Choose File
      </label>
      <input
        id="file-input"
        type="file"
        class="file-input-hidden"
        @change="onFileSelected"
      />
      <span v-if="selectedFile" class="selected-filename">{{ selectedFile.name }}</span>
      <button
        v-if="selectedFile"
        class="btn btn-confirm"
        :disabled="uploading"
        @click="uploadFile"
      >
        {{ uploading ? 'Uploading...' : 'Upload' }}
      </button>
      <button class="btn btn-folder" @click="showNewFolderInput = !showNewFolderInput">
        New Folder
      </button>
    </div>

    <!-- New folder input -->
    <div v-if="showNewFolderInput" class="new-folder-section">
      <input
        v-model="newFolderName"
        type="text"
        placeholder="Folder name"
        class="folder-name-input"
        @keyup.enter="createFolder"
      />
      <button class="btn btn-confirm" @click="createFolder">Create</button>
      <button class="btn btn-cancel" @click="showNewFolderInput = false; newFolderName = ''">Cancel</button>
    </div>

    <div v-if="error" class="error-message">{{ error }}</div>
    <div v-if="success" class="success-message">{{ success }}</div>

    <div v-if="loading" class="loading">Loading files...</div>

    <div v-else-if="files.length === 0 && !currentPath" class="empty-state">
      No files yet. Upload one to get started.
    </div>

    <div v-else-if="files.length === 0 && currentPath" class="empty-state">
      This folder is empty.
    </div>

    <table v-else class="files-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Modified</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="file in files"
          :key="file.name"
          :class="{ 'folder-row': file.is_dir }"
          @click="file.is_dir ? openFolder(file.name) : null"
        >
          <td>{{ file.is_dir ? '\uD83D\uDCC1 ' : '' }}{{ file.name }}</td>
          <td>{{ file.is_dir ? 'Folder' : formatSize(file.size) }}</td>
          <td>{{ formatDate(file.mod_time) }}</td>
          <td class="actions-cell" @click.stop>
            <button v-if="!file.is_dir" class="btn btn-action" @click="downloadFile(file.name)">
              Download
            </button>
            <button
              v-if="activeTab === 'my' || (activeTab === 'shared' && isAdmin)"
              class="btn btn-delete"
              @click="deleteFile(file.name, file.is_dir)"
            >
              Delete
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    name: 'FilesManager',
    data() {
      return {
        activeTab: 'my',
        files: [],
        selectedFile: null,
        uploading: false,
        loading: false,
        error: '',
        success: '',
        storageUsage: null,
        currentPath: '',
        newFolderName: '',
        showNewFolderInput: false,
      };
    },
    computed: {
      isAdmin() {
        return (localStorage.getItem('user_role') || '').toLowerCase() === 'admin';
      },
      pathSegments() {
        if (!this.currentPath) return [];
        return this.currentPath.split('/').filter(Boolean);
      },
    },
    methods: {
      pathParam() {
        return this.currentPath ? `?path=${encodeURIComponent(this.currentPath)}` : '';
      },
      switchTab(tab) {
        this.activeTab = tab;
        this.currentPath = '';
        this.showNewFolderInput = false;
        this.newFolderName = '';
        this.loadFiles();
      },
      navigateTo(path) {
        this.currentPath = path;
        this.loadFiles();
      },
      openFolder(name) {
        this.currentPath = this.currentPath ? this.currentPath + '/' + name : name;
        this.loadFiles();
      },
      async loadFiles() {
        this.error = '';
        this.loading = true;
        try {
          const base = this.activeTab === 'my' ? '/api/files/list' : '/api/files/shared/list';
          const response = await axios.get(base + this.pathParam());
          this.files = response.data.data || [];
        } catch (err) {
          this.error = 'Failed to load files';
          this.files = [];
        } finally {
          this.loading = false;
        }
      },
      async loadStorageUsage() {
        if (!this.isAdmin) return;
        try {
          const response = await axios.get('/api/files/usage');
          this.storageUsage = response.data.data;
        } catch (err) {
          console.error('Failed to load storage usage:', err);
        }
      },
      folderLimit(folderName) {
        if (!this.storageUsage) return 0;
        if (folderName === 'Shared') return this.storageUsage.max_shared;
        return this.storageUsage.max_per_user;
      },
      onFileSelected(event) {
        this.selectedFile = event.target.files[0] || null;
        this.error = '';
        this.success = '';
      },
      async uploadFile() {
        if (!this.selectedFile) return;
        this.uploading = true;
        this.error = '';
        this.success = '';
        try {
          const formData = new FormData();
          formData.append('file', this.selectedFile);
          const base = this.activeTab === 'my' ? '/api/files/upload' : '/api/files/shared/upload';
          await axios.post(base + this.pathParam(), formData);
          this.success = 'File uploaded successfully';
          this.selectedFile = null;
          const input = document.getElementById('file-input');
          if (input) input.value = '';
          await this.loadFiles();
          await this.loadStorageUsage();
        } catch (err) {
          const msg = err.response?.data?.error;
          this.error = msg || 'Failed to upload file';
        } finally {
          this.uploading = false;
        }
      },
      downloadFile(filename) {
        const prefix = this.activeTab === 'my' ? '/api/files/download/' : '/api/files/shared/download/';
        const pathQuery = this.pathParam();
        const token = localStorage.getItem('user_token');
        const url = prefix + encodeURIComponent(filename) + (pathQuery ? pathQuery : '');
        fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => {
            if (!res.ok) throw new Error('Download failed');
            return res.blob();
          })
          .then((blob) => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          })
          .catch(() => {
            this.error = 'Failed to download file';
          });
      },
      async deleteFile(filename, isDir = false) {
        this.error = '';
        this.success = '';
        if (isDir) {
          if (!confirm(`Delete folder "${filename}" and all its contents? This cannot be undone.`)) {
            return;
          }
        }
        try {
          const prefix = this.activeTab === 'shared' ? '/api/files/shared/delete/' : '/api/files/delete/';
          const pathQuery = this.pathParam();
          const recursiveParam = isDir ? (pathQuery ? '&recursive=true' : '?recursive=true') : '';
          await axios.delete(`${prefix}${encodeURIComponent(filename)}${pathQuery}${recursiveParam}`);
          this.success = 'Deleted successfully';
          await this.loadFiles();
          await this.loadStorageUsage();
        } catch (err) {
          const msg = err.response?.data?.error;
          this.error = msg || 'Failed to delete';
        }
      },
      async createFolder() {
        if (!this.newFolderName.trim()) return;
        this.error = '';
        this.success = '';
        try {
          const endpoint = this.activeTab === 'my' ? '/api/files/folder' : '/api/files/shared/folder';
          await axios.post(endpoint, { name: this.newFolderName.trim(), path: this.currentPath });
          this.success = 'Folder created';
          this.newFolderName = '';
          this.showNewFolderInput = false;
          await this.loadFiles();
        } catch (err) {
          const msg = err.response?.data?.error;
          this.error = msg || 'Failed to create folder';
        }
      },
      formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
      },
      formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      },
    },
    mounted() {
      this.loadFiles();
      this.loadStorageUsage();
    },
  };
</script>

<style scoped>
  .files-manager {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    max-width: 900px;
    margin: 0 auto;
  }

  .files-manager h2 {
    margin-bottom: var(--space-xl);
  }

  /* Storage usage panel (admin) */
  .storage-panel {
    width: 100%;
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
    text-align: left;
  }

  .storage-panel h3 {
    margin: 0 0 var(--space-xs);
    color: var(--text-heading-card);
    font-size: var(--text-xl);
  }

  .storage-total {
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    margin-bottom: var(--space-sm);
  }

  /* Tables (shared pattern for files and storage) */
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
  }

  th {
    background-color: var(--surface-elevated);
    color: var(--text-on-light);
  }

  td {
    color: var(--text-on-light);
  }

  .storage-panel td,
  .storage-panel th {
    color: var(--text-on-dark);
  }

  .storage-panel th {
    background-color: var(--surface-card-inner);
  }

  /* Breadcrumbs */
  .breadcrumbs {
    width: 100%;
    text-align: left;
    padding: var(--space-sm) 0;
    margin-bottom: var(--space-sm);
    font-size: var(--text-sm);
    color: var(--text-on-light);
  }

  .breadcrumb-link {
    cursor: pointer;
    color: var(--brand-accent);
    text-decoration: underline;
  }

  .breadcrumb-link:hover {
    filter: brightness(1.2);
  }

  .breadcrumb-current {
    color: var(--text-on-light);
    text-decoration: none;
    cursor: default;
    font-weight: 600;
  }

  .breadcrumb-separator {
    color: var(--text-on-light);
    margin: 0 var(--space-2xs);
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .tab-btn {
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    cursor: pointer;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .tab-btn.active {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    font-weight: 600;
  }

  .tab-btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  /* Upload section */
  .upload-section {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
    justify-content: center;
  }

  .file-input-hidden {
    display: none;
  }

  .selected-filename {
    color: var(--text-on-light);
    font-size: var(--text-sm);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* New folder section */
  .new-folder-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
    justify-content: center;
  }

  .folder-name-input {
    padding: var(--space-sm);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-sm);
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    width: 200px;
  }

  .folder-name-input::placeholder {
    color: var(--text-on-dark);
    opacity: 0.5;
  }

  /* Buttons */
  .btn {
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    filter: none;
  }

  .btn-upload {
    background-color: var(--brand-accent);
    color: var(--text-on-dark);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    display: inline-block;
  }

  .btn-confirm {
    background-color: var(--feedback-success);
    color: var(--text-on-dark);
  }

  .btn-cancel {
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    border: 2px solid var(--border-card);
  }

  .btn-folder {
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-lg);
  }

  .btn-action {
    background-color: var(--brand-accent);
    color: var(--text-on-dark);
    padding: var(--space-2xs) var(--space-sm);
  }

  .btn-delete {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
    padding: var(--space-2xs) var(--space-sm);
    font-weight: bold;
  }

  /* Folder row styling */
  .folder-row {
    cursor: pointer;
  }

  .folder-row:hover td {
    background-color: var(--surface-elevated);
  }

  /* Feedback messages */
  .error-message {
    color: var(--feedback-error);
    margin-bottom: var(--space-md);
  }

  .success-message {
    color: var(--feedback-success);
    margin-bottom: var(--space-md);
  }

  .loading,
  .empty-state {
    color: var(--text-on-light);
    padding: var(--space-xl);
    font-size: var(--text-base);
  }

  /* File table overrides */
  .files-table {
    margin-top: 0;
  }

  .actions-cell {
    display: flex;
    gap: var(--space-xs);
  }

  /* Mobile */
  @media (max-width: 767px) {
    .files-manager {
      padding: var(--space-md) var(--space-sm);
      padding-top: 70px;
    }

    .files-manager h1 {
      font-size: var(--text-2xl);
    }

    th,
    td {
      padding: var(--space-2xs);
      font-size: var(--text-sm);
    }

    .actions-cell {
      flex-direction: column;
    }

    .storage-panel {
      padding: var(--space-md);
    }

    .folder-name-input {
      width: 150px;
    }
  }
</style>
