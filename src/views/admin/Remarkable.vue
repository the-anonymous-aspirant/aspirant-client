<template>
  <div class="remarkable-view">
    <h1>reMarkable Notebooks</h1>
    <h2 class="page-subtitle">Browse, render, and upload notebooks</h2>

    <!-- Sync Status Card -->
    <div class="status-card">
      <h3>Sync Status</h3>
      <div v-if="statusLoading" class="loading-text">Loading status...</div>
      <div v-else-if="statusError" class="error-text">{{ statusError }}</div>
      <div v-else class="status-grid">
        <div class="status-item">
          <span class="status-label">Last Sync</span>
          <span class="status-value">{{ formatTime(syncStatus.last_sync) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Direction</span>
          <span class="status-value">{{ syncStatus.last_sync_direction || '—' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Files Synced</span>
          <span class="status-value">{{ syncStatus.files_synced ?? '—' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Device IP</span>
          <span class="status-value">{{ syncStatus.device_ip || '—' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Battery</span>
          <span class="status-value">{{ syncStatus.battery != null ? syncStatus.battery + '%' : '—' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Next Sync</span>
          <span class="status-value">{{ nextSyncCountdown }}</span>
        </div>
      </div>
    </div>

    <!-- Folder Browser Card -->
    <div class="browser-card">
      <h3>Folder Browser</h3>

      <!-- DPI selector + Breadcrumb row -->
      <div class="browser-toolbar">
        <div class="dpi-selector">
          <label for="dpi-select">DPI</label>
          <select id="dpi-select" v-model.number="selectedDpi">
            <option :value="150">150</option>
            <option :value="300">300</option>
            <option :value="600">600</option>
            <option :value="1200">1200</option>
          </select>
        </div>
      </div>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <span class="breadcrumb-item" :class="{ active: !currentFolderId }" @click="navigateTo(null)">
          Root
        </span>
        <template v-for="crumb in breadcrumbs" :key="crumb.id">
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-item" :class="{ active: crumb.id === currentFolderId }" @click="navigateTo(crumb.id)">
            {{ crumb.name }}
          </span>
        </template>
      </div>

      <div v-if="browserLoading" class="loading-text">Loading...</div>
      <div v-else-if="browserError" class="error-text">{{ browserError }}</div>
      <div v-else>
        <!-- Subfolders -->
        <div v-if="currentFolders.length" class="item-list">
          <div v-for="folder in currentFolders" :key="folder.id" class="item-row folder-row" @click="navigateTo(folder.id)">
            <span class="item-icon">&#128193;</span>
            <span class="item-name">{{ folder.name }}</span>
          </div>
        </div>

        <!-- Documents -->
        <div v-if="currentDocuments.length" class="item-list">
          <div v-for="doc in currentDocuments" :key="doc.id" class="item-row doc-row">
            <span class="item-icon">&#128196;</span>
            <span class="item-name">{{ doc.name }}</span>
            <span class="item-meta">{{ doc.page_count }} pages</span>
            <div class="item-actions">
              <button class="btn-sm" @click="renderPage(doc.id, 0)" title="Render first page as PNG">PNG</button>
              <button class="btn-sm" @click="exportNotebook(doc.id, 'pdf')" title="Export as PDF">PDF</button>
              <button class="btn-sm" @click="exportNotebook(doc.id, 'png')" title="Export as ZIP of PNGs">ZIP</button>
            </div>
          </div>
        </div>

        <div v-if="!currentFolders.length && !currentDocuments.length" class="empty-text">
          This folder is empty.
        </div>
      </div>
    </div>

    <!-- Upload to Device Card -->
    <div class="upload-card">
      <h3>Upload to Device</h3>
      <p class="upload-desc">Upload a PDF or ePub to sync to your reMarkable at the next midnight sync.</p>

      <div class="upload-form">
        <div class="upload-row">
          <div class="upload-field">
            <label for="upload-file">File</label>
            <input id="upload-file" type="file" accept=".pdf,.epub" @change="onFileSelect" :disabled="uploading" />
          </div>
          <div class="upload-field">
            <label for="upload-folder">Target Folder</label>
            <select id="upload-folder" v-model="uploadTargetFolder" :disabled="uploading">
              <option value="">Root (no folder)</option>
              <option v-for="folder in allFolders" :key="folder.id" :value="folder.id">
                {{ folder.name }}
              </option>
            </select>
          </div>
          <button class="btn-upload" @click="uploadFile" :disabled="uploading || !selectedFile">
            <span v-if="uploading">Uploading...</span>
            <span v-else>Upload</span>
          </button>
        </div>
        <div v-if="uploadError" class="error-text">{{ uploadError }}</div>
        <div v-if="uploadSuccess" class="success-text">{{ uploadSuccess }}</div>
      </div>

      <!-- Pending uploads -->
      <div class="pending-section">
        <h4>Pending Uploads</h4>
        <div v-if="pendingLoading" class="loading-text">Loading...</div>
        <div v-else-if="pendingItems.length === 0" class="empty-text">No pending uploads.</div>
        <div v-else class="pending-list">
          <div v-for="item in pendingItems" :key="item.id" class="pending-item">
            <span class="pending-name">{{ item.filename }}</span>
            <span class="pending-size">{{ formatSize(item.size) }}</span>
            <button class="btn-delete" @click="deletePending(item.id)" title="Remove">&#10005;</button>
          </div>
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
      // Sync status
      syncStatus: {},
      statusLoading: true,
      statusError: null,
      nextSyncCountdown: '—',

      // Folder browser
      selectedDpi: 300,
      tree: [],
      currentFolderId: null,
      breadcrumbs: [],
      currentFolders: [],
      currentDocuments: [],
      browserLoading: true,
      browserError: null,

      // All folders (for upload selector)
      allFolders: [],

      // Upload
      selectedFile: null,
      uploadTargetFolder: '',
      uploading: false,
      uploadError: null,
      uploadSuccess: null,

      // Pending
      pendingItems: [],
      pendingLoading: true,

      // Timers
      countdownInterval: null,
    };
  },
  methods: {
    async fetchSyncStatus() {
      try {
        const resp = await axios.get('/api/remarkable/sync/status');
        this.syncStatus = resp.data;
        this.statusError = null;
      } catch (err) {
        this.statusError = 'Failed to load sync status: ' + (err.response?.data?.error?.message || err.message);
      }
      this.statusLoading = false;
    },

    async fetchTree() {
      this.browserLoading = true;
      try {
        const resp = await axios.get('/api/remarkable/tree');
        this.tree = resp.data;
        this.browserError = null;
        this.updateBrowserView();
      } catch (err) {
        this.browserError = 'Failed to load tree: ' + (err.response?.data?.error?.message || err.message);
      }
      this.browserLoading = false;
    },

    async fetchFolders() {
      try {
        const resp = await axios.get('/api/remarkable/folders');
        this.allFolders = resp.data;
      } catch (err) {
        console.error('Failed to load folders:', err);
      }
    },

    async fetchPending() {
      try {
        const resp = await axios.get('/api/remarkable/to-device/pending');
        this.pendingItems = resp.data;
      } catch (err) {
        console.error('Failed to load pending items:', err);
      }
      this.pendingLoading = false;
    },

    updateBrowserView() {
      const findInTree = (nodes, targetId) => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          if (node.children) {
            const found = findInTree(node.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };

      let items;
      if (this.currentFolderId === null) {
        items = this.tree;
      } else {
        const folder = findInTree(this.tree, this.currentFolderId);
        items = folder ? (folder.children || []) : [];
      }

      this.currentFolders = items.filter(i => i.type === 'CollectionType');
      this.currentDocuments = items.filter(i => i.type === 'DocumentType');
    },

    navigateTo(folderId) {
      this.currentFolderId = folderId;

      // Rebuild breadcrumbs
      if (folderId === null) {
        this.breadcrumbs = [];
      } else {
        const crumbs = [];
        const findPath = (nodes, targetId, path) => {
          for (const node of nodes) {
            if (node.id === targetId) {
              path.push({ id: node.id, name: node.name });
              return true;
            }
            if (node.children) {
              path.push({ id: node.id, name: node.name });
              if (findPath(node.children, targetId, path)) return true;
              path.pop();
            }
          }
          return false;
        };
        findPath(this.tree, folderId, crumbs);
        this.breadcrumbs = crumbs;
      }

      this.updateBrowserView();
    },

    renderPage(notebookId, page) {
      const url = `/api/remarkable/notebooks/${notebookId}/pages/${page}/render?format=png&dpi=${this.selectedDpi}`;
      window.open(url, '_blank');
    },

    exportNotebook(notebookId, format) {
      const url = `/api/remarkable/notebooks/${notebookId}/export?format=${format}&dpi=${this.selectedDpi}`;
      window.open(url, '_blank');
    },

    onFileSelect(event) {
      const files = event.target.files;
      this.selectedFile = files.length ? files[0] : null;
      this.uploadError = null;
      this.uploadSuccess = null;
    },

    async uploadFile() {
      if (!this.selectedFile) return;

      this.uploading = true;
      this.uploadError = null;
      this.uploadSuccess = null;

      const formData = new FormData();
      formData.append('file', this.selectedFile);
      if (this.uploadTargetFolder) {
        formData.append('target_folder_id', this.uploadTargetFolder);
      }

      try {
        const resp = await axios.post('/api/remarkable/to-device/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        this.uploadSuccess = `Uploaded "${resp.data.filename}" (${this.formatSize(resp.data.size)})`;
        this.selectedFile = null;
        // Reset file input
        const fileInput = document.getElementById('upload-file');
        if (fileInput) fileInput.value = '';
        await this.fetchPending();
      } catch (err) {
        const errData = err.response?.data?.error;
        this.uploadError = errData?.message || err.message;
      }
      this.uploading = false;
    },

    async deletePending(itemId) {
      try {
        await axios.delete(`/api/remarkable/to-device/${itemId}`);
        await this.fetchPending();
      } catch (err) {
        console.error('Failed to delete pending item:', err);
      }
    },

    formatTime(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleString();
    },

    formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    updateCountdown() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight - now;
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      this.nextSyncCountdown = `${hours}h ${minutes}m`;
    },
  },

  mounted() {
    this.fetchSyncStatus();
    this.fetchTree();
    this.fetchFolders();
    this.fetchPending();
    this.updateCountdown();
    this.countdownInterval = setInterval(this.updateCountdown, 60000);
  },

  beforeUnmount() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  },
};
</script>

<style scoped>
.remarkable-view {
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

.loading-text,
.empty-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  padding: var(--space-xl) 0;
  text-align: center;
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

.success-text {
  color: var(--feedback-success);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

/* Status Card */
.status-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.status-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-md);
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.status-label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.status-value {
  font-size: var(--text-sm);
  color: var(--text-on-dark);
}

/* Browser Card */
.browser-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.browser-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.browser-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-sm);
}

.dpi-selector {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.dpi-selector label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.dpi-selector select {
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-md);
  font-size: var(--text-sm);
  flex-wrap: wrap;
}

.breadcrumb-item {
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  transition: color var(--transition-moderate);
}

.breadcrumb-item:hover {
  color: var(--text-on-dark);
}

.breadcrumb-item.active {
  color: var(--text-on-dark);
  font-weight: 600;
}

.breadcrumb-sep {
  color: var(--border-card);
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  margin-bottom: var(--space-sm);
}

.item-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-moderate);
}

.folder-row {
  cursor: pointer;
}

.folder-row:hover {
  background-color: var(--surface-card-inner);
}

.item-icon {
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-on-dark);
}

.item-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.item-actions {
  display: flex;
  gap: var(--space-2xs);
  flex-shrink: 0;
}

.btn-sm {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-weight: 600;
  transition: color var(--transition-moderate), border-color var(--transition-moderate);
}

.btn-sm:hover {
  color: var(--text-on-dark);
  border-color: var(--text-on-dark);
}

/* Upload Card */
.upload-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
}

.upload-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-sm) 0;
}

.upload-card h4 {
  color: var(--text-on-dark);
  font-size: var(--text-base);
  margin: var(--space-lg) 0 var(--space-sm) 0;
}

.upload-desc {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-bottom: var(--space-md);
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.upload-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.upload-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  flex: 1;
  min-width: 150px;
}

.upload-field label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.upload-field input[type="file"] {
  font-size: var(--text-sm);
  color: var(--text-on-dark);
}

.upload-field select {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.btn-upload {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  flex-shrink: 0;
}

.btn-upload:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-upload:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Pending */
.pending-section {
  margin-top: var(--space-md);
}

.pending-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.pending-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-sm);
}

.pending-name {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-on-dark);
}

.pending-size {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.btn-delete {
  background: none;
  border: none;
  color: var(--feedback-error);
  cursor: pointer;
  font-size: var(--text-sm);
  padding: var(--space-2xs);
  opacity: 0.6;
  transition: opacity var(--transition-moderate);
}

.btn-delete:hover {
  opacity: 1;
}

/* Mobile */
@media (max-width: 768px) {
  .remarkable-view {
    padding: var(--space-md);
  }

  .status-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .upload-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
