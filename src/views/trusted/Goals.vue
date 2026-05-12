<template>
  <div class="goals-view">
    <h1>Goal Trees</h1>
    <h2 class="page-subtitle">Plan and track your goals</h2>

    <div class="goals-card">
      <div class="card-header">
        <h3>Your Trees</h3>
        <button class="btn-create" @click="showCreateDialog = true" :disabled="creating">
          + New Tree
        </button>
      </div>

      <div v-if="loading" class="loading-text">Loading trees...</div>
      <div v-else-if="error" class="error-text">{{ error }}</div>
      <div v-else-if="trees.length === 0" class="empty-text">
        No goal trees yet. Create one to get started.
      </div>
      <div v-else class="tree-list">
        <div v-for="tree in trees" :key="tree.id" class="tree-item" @click="openTree(tree.id)">
          <div class="tree-info">
            <span class="tree-name">{{ tree.name }}</span>
            <span class="tree-date">{{ formatDate(tree.updated_at) }}</span>
          </div>
          <div class="tree-actions" @click.stop>
            <button class="btn-action" @click="startRename(tree)" title="Rename">
              &#9998;
            </button>
            <button class="btn-action btn-delete" @click="confirmDelete(tree)" title="Delete">
              &#10005;
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="cancelCreate">
      <div class="dialog">
        <h3>Create New Tree</h3>
        <input
          ref="createInput"
          v-model="newTreeName"
          placeholder="Tree name"
          @keyup.enter="createTree"
          @keyup.escape="cancelCreate"
          maxlength="100"
        />
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelCreate">Cancel</button>
          <button class="btn-confirm" @click="createTree" :disabled="creating || !newTreeName.trim()">
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Rename Dialog -->
    <div v-if="showRenameDialog" class="dialog-overlay" @click.self="cancelRename">
      <div class="dialog">
        <h3>Rename Tree</h3>
        <input
          ref="renameInput"
          v-model="renameValue"
          placeholder="New name"
          @keyup.enter="renameTree"
          @keyup.escape="cancelRename"
          maxlength="100"
        />
        <div v-if="renameError" class="error-text">{{ renameError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelRename">Cancel</button>
          <button class="btn-confirm" @click="renameTree" :disabled="renaming || !renameValue.trim()">
            {{ renaming ? 'Renaming...' : 'Rename' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="cancelDelete">
      <div class="dialog">
        <h3>Delete Tree</h3>
        <p class="dialog-message">
          Are you sure you want to delete <strong>{{ deleteTarget?.name }}</strong>?
          This will also delete all nodes and comments.
        </p>
        <div v-if="deleteError" class="error-text">{{ deleteError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelDelete">Cancel</button>
          <button class="btn-confirm btn-danger" @click="deleteTree" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
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
      trees: [],
      loading: true,
      error: null,

      showCreateDialog: false,
      newTreeName: '',
      creating: false,
      createError: null,

      showRenameDialog: false,
      renameTarget: null,
      renameValue: '',
      renaming: false,
      renameError: null,

      showDeleteDialog: false,
      deleteTarget: null,
      deleting: false,
      deleteError: null,
    };
  },
  methods: {
    async fetchTrees() {
      this.loading = true;
      this.error = null;
      try {
        const resp = await axios.get('/api/goals/trees');
        this.trees = resp.data;
      } catch (err) {
        this.error = 'Failed to load trees: ' + (err.response?.data?.error?.message || err.message);
      }
      this.loading = false;
    },

    openTree(treeId) {
      this.$router.push({ path: `/trusted/goals/${treeId}` });
    },

    async createTree() {
      if (!this.newTreeName.trim()) return;
      this.creating = true;
      this.createError = null;
      try {
        await axios.post('/api/goals/trees', { name: this.newTreeName.trim() });
        this.showCreateDialog = false;
        this.newTreeName = '';
        await this.fetchTrees();
      } catch (err) {
        this.createError = err.response?.data?.error?.message || err.message;
      }
      this.creating = false;
    },

    cancelCreate() {
      this.showCreateDialog = false;
      this.newTreeName = '';
      this.createError = null;
    },

    startRename(tree) {
      this.renameTarget = tree;
      this.renameValue = tree.name;
      this.renameError = null;
      this.showRenameDialog = true;
      this.$nextTick(() => {
        this.$refs.renameInput?.focus();
        this.$refs.renameInput?.select();
      });
    },

    async renameTree() {
      if (!this.renameValue.trim() || !this.renameTarget) return;
      this.renaming = true;
      this.renameError = null;
      try {
        await axios.patch(`/api/goals/trees/${this.renameTarget.id}`, {
          name: this.renameValue.trim(),
        });
        this.showRenameDialog = false;
        this.renameTarget = null;
        this.renameValue = '';
        await this.fetchTrees();
      } catch (err) {
        this.renameError = err.response?.data?.error?.message || err.message;
      }
      this.renaming = false;
    },

    cancelRename() {
      this.showRenameDialog = false;
      this.renameTarget = null;
      this.renameValue = '';
      this.renameError = null;
    },

    confirmDelete(tree) {
      this.deleteTarget = tree;
      this.deleteError = null;
      this.showDeleteDialog = true;
    },

    async deleteTree() {
      if (!this.deleteTarget) return;
      this.deleting = true;
      this.deleteError = null;
      try {
        await axios.delete(`/api/goals/trees/${this.deleteTarget.id}`);
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        await this.fetchTrees();
      } catch (err) {
        this.deleteError = err.response?.data?.error?.message || err.message;
      }
      this.deleting = false;
    },

    cancelDelete() {
      this.showDeleteDialog = false;
      this.deleteTarget = null;
      this.deleteError = null;
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    },
  },
  watch: {
    showCreateDialog(val) {
      if (val) {
        this.$nextTick(() => this.$refs.createInput?.focus());
      }
    },
  },
  mounted() {
    this.fetchTrees();
  },
};
</script>

<style scoped>
.goals-view {
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

.goals-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.card-header h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0;
}

.btn-create {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-create:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-create:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.tree-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md);
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color var(--transition-moderate), transform var(--transition-moderate);
}

.tree-item:hover {
  filter: brightness(1.1);
  transform: translateX(4px);
}

.tree-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.tree-name {
  color: var(--text-on-dark);
  font-size: var(--text-base);
  font-weight: 500;
}

.tree-date {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.tree-actions {
  display: flex;
  gap: var(--space-xs);
}

.btn-action {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  padding: var(--space-2xs) var(--space-xs);
  transition: color var(--transition-moderate), border-color var(--transition-moderate);
}

.btn-action:hover {
  color: var(--text-on-dark);
  border-color: var(--text-on-dark);
}

.btn-action.btn-delete:hover {
  color: var(--feedback-error);
  border-color: var(--feedback-error);
}

/* Dialog Overlay */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 90%;
  max-width: 400px;
}

.dialog h3 {
  color: var(--text-heading-card);
  font-size: var(--text-lg);
  margin: 0 0 var(--space-md) 0;
}

.dialog input {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-base);
  box-sizing: border-box;
}

.dialog-message {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-md) 0;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

.btn-cancel {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  padding: var(--space-xs) var(--space-lg);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: color var(--transition-moderate), border-color var(--transition-moderate);
}

.btn-cancel:hover {
  color: var(--text-on-dark);
  border-color: var(--text-on-dark);
}

.btn-confirm {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate);
}

.btn-confirm:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-confirm.btn-danger {
  background-color: var(--feedback-error);
}

@media (max-width: 768px) {
  .goals-view {
    padding: var(--space-md);
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .tree-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .tree-actions {
    align-self: flex-end;
  }
}
</style>
