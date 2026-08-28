<template>
  <div class="goals-view">
    <h1>Goal Trees</h1>
    <h2 class="page-subtitle">Plan and track your goals</h2>

    <div class="goals-card">
      <div class="card-header">
        <h3>Your Trees</h3>
        <AspButton variant="primary" @click="showCreateDialog = true" :disabled="creating">
          + New Tree
        </AspButton>
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
            <AspTooltip content="Rename">
              <AspButton variant="ghost" size="icon" aria-label="Rename" @click="startRename(tree)">
                &#9998;
              </AspButton>
            </AspTooltip>
            <AspTooltip content="Delete">
              <AspButton variant="ghost" size="icon" aria-label="Delete" @click="confirmDelete(tree)">
                &#10005;
              </AspButton>
            </AspTooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreateDialog" v-overlay-history="cancelCreate" class="dialog-overlay" @click.self="cancelCreate">
      <div class="dialog">
        <h3>Create New Tree</h3>
        <!-- ref kept verbatim: `this.$refs.createInput?.focus()` reaches the
             inner <input> through AspInput's defineExpose (#4303). Without it
             the ref resolves to the component instance and the call is a silent
             no-op — the affordance disappears with nothing going red. -->
        <AspInput
          ref="createInput"
          v-model="newTreeName"
          placeholder="Tree name"
          maxlength="100"
          @keyup.enter="createTree"
          @keyup.escape="cancelCreate"
        />
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelCreate">Cancel</AspButton>
          <AspButton variant="primary" @click="createTree" :disabled="creating || !newTreeName.trim()">
            {{ creating ? 'Creating...' : 'Create' }}
          </AspButton>
        </div>
      </div>
    </div>

    <!-- Rename Dialog -->
    <div v-if="showRenameDialog" v-overlay-history="cancelRename" class="dialog-overlay" @click.self="cancelRename">
      <div class="dialog">
        <h3>Rename Tree</h3>
        <AspInput
          ref="renameInput"
          v-model="renameValue"
          placeholder="New name"
          maxlength="100"
          @keyup.enter="renameTree"
          @keyup.escape="cancelRename"
        />
        <div v-if="renameError" class="error-text">{{ renameError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelRename">Cancel</AspButton>
          <AspButton variant="primary" @click="renameTree" :disabled="renaming || !renameValue.trim()">
            {{ renaming ? 'Renaming...' : 'Rename' }}
          </AspButton>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div v-if="showDeleteDialog" v-overlay-history="cancelDelete" class="dialog-overlay" @click.self="cancelDelete">
      <div class="dialog">
        <h3>Delete Tree</h3>
        <p class="dialog-message">
          Are you sure you want to delete <strong>{{ deleteTarget?.name }}</strong>?
          This will also delete all nodes and comments.
        </p>
        <div v-if="deleteError" class="error-text">{{ deleteError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelDelete">Cancel</AspButton>
          <AspButton variant="destructive" @click="deleteTree" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </AspButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { AspInput } from '@aspirant/design-system';

import axios from 'axios';
import { AspButton, AspTooltip } from '@aspirant/design-system';

export default {
  components: { AspButton, AspInput, AspTooltip },
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
      this.$router.push({ path: `/member/shared/goals/${treeId}` });
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
  /* #3027/§3.18: a component that paints a surface must pair it with its own
     ink. This card painted --surface-card and inherited the page's ink, so
     currentColor inside it was the same value as the surface — .tree-date
     (which derives from currentColor) rendered at 1.00:1, invisible, and so
     did the two row-action glyphs. The port surfaced it: AspButton's ghost ink
     is a currentColor mix by design, so it inherits whatever the consumer's
     surface declares — and this one declared nothing. */
  color: var(--text-on-dark);
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

/* The two row actions are AspButton variant="ghost" size="icon" — the DS owns
   their paint, hover, focus ring and the 44px square target (§3.23 rule-4), so
   .btn-action / .btn-delete are deleted rather than reduced: a scoped rule
   lands on the DS root and overrides the component the port just adopted
   (#4323/#4324 measured that live). The red delete-hover goes with them; the
   AspTooltip content and the aria-label carry the meaning. */

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

/* §3.86: an always-live data-entry control on a dark card adopts the DS control
   fill. Both fields are AspInput now, so the rule that painted this dialog's
   well by hand is gone rather than retuned — there is no native <input> left in
   the dialog for it to reach.

   What actually changes, measured on the built page rather than assumed: the
   old box was a 1px --border-card (#ffb300, amber) around a translucent
   --surface-card-inner well; the new one is the DS control, --surface-elevated
   behind --text-body. Both clear the WCAG 1.4.11 3:1 non-text floor, and they
   clear it by DIFFERENT mechanisms in each theme — in light the near-white fill
   carries the boundary against the #424242 card at 9.55:1 while the border
   alone is 2.21:1; in dark the fill goes to 1.14:1 and the #cccccc border
   carries it at 8.94:1. So this is a design-of-record adoption, not a contrast
   fix: the old boundary was legible too. Value ink measures 9.55:1 light /
   9.57:1 dark either way. */

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
