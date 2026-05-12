<template>
  <div class="tree-switcher" ref="switcherRef">
    <button class="switcher-trigger" @click="toggleDropdown">
      <span class="trigger-label">{{ activeTreeName || 'Select tree' }}</span>
      <span class="trigger-arrow" :class="{ open: isOpen }">&#9662;</span>
    </button>

    <div v-if="isOpen" class="switcher-dropdown">
      <div class="dropdown-list">
        <div
          v-for="tree in trees"
          :key="tree.id"
          class="dropdown-item"
          :class="{ active: tree.id === activeTreeId }"
          @click="switchTree(tree)"
        >
          <span class="item-name">{{ tree.name }}</span>
          <div class="item-actions" @click.stop>
            <button class="btn-item-action" @click="startRename(tree)" title="Rename">&#9998;</button>
            <button class="btn-item-action btn-item-delete" @click="startDelete(tree)" title="Delete">&#10005;</button>
          </div>
        </div>
        <div v-if="trees.length === 0 && !loadingTrees" class="dropdown-empty">
          No trees yet
        </div>
        <div v-if="loadingTrees" class="dropdown-empty">Loading...</div>
      </div>
      <button class="btn-new-tree" @click="startCreate">+ New Tree</button>
    </div>

    <!-- Rename dialog -->
    <div v-if="showRename" class="dialog-overlay" @click.self="cancelRename">
      <div class="dialog">
        <h3>Rename Tree</h3>
        <input
          ref="renameInput"
          v-model="renameValue"
          placeholder="New name"
          @keyup.enter="submitRename"
          @keyup.escape="cancelRename"
          maxlength="100"
        />
        <div v-if="renameError" class="error-text">{{ renameError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelRename">Cancel</button>
          <button
            class="btn-confirm"
            @click="submitRename"
            :disabled="renaming || !renameValue.trim()"
          >
            {{ renaming ? 'Saving...' : 'Rename' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Create dialog -->
    <div v-if="showCreate" class="dialog-overlay" @click.self="cancelCreate">
      <div class="dialog">
        <h3>New Tree</h3>
        <input
          ref="createInput"
          v-model="createValue"
          placeholder="Tree name"
          @keyup.enter="submitCreate"
          @keyup.escape="cancelCreate"
          maxlength="100"
        />
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelCreate">Cancel</button>
          <button
            class="btn-confirm"
            @click="submitCreate"
            :disabled="creating || !createValue.trim()"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-if="showDelete" class="dialog-overlay" @click.self="cancelDelete">
      <div class="dialog">
        <h3>Delete Tree</h3>
        <p class="dialog-message">
          Delete <strong>{{ deleteTarget?.name }}</strong>? All nodes and comments will be removed.
        </p>
        <div v-if="deleteError" class="error-text">{{ deleteError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelDelete">Cancel</button>
          <button class="btn-confirm btn-danger" @click="submitDelete" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

export default {
  props: {
    activeTreeId: { type: String, default: null },
  },
  emits: ['tree-switched', 'tree-renamed', 'tree-created', 'tree-deleted'],
  setup(props, { emit }) {
    const router = useRouter();
    const switcherRef = ref(null);

    const isOpen = ref(false);
    const trees = ref([]);
    const loadingTrees = ref(false);
    const activeTreeName = ref('');

    const showRename = ref(false);
    const renameTarget = ref(null);
    const renameValue = ref('');
    const renaming = ref(false);
    const renameError = ref(null);
    const renameInput = ref(null);

    const showCreate = ref(false);
    const createValue = ref('');
    const creating = ref(false);
    const createError = ref(null);
    const createInput = ref(null);

    const showDelete = ref(false);
    const deleteTarget = ref(null);
    const deleting = ref(false);
    const deleteError = ref(null);

    async function fetchTrees() {
      loadingTrees.value = true;
      try {
        const resp = await axios.get('/api/goals/trees');
        trees.value = resp.data || [];
        updateActiveTreeName();
      } catch (err) {
        trees.value = [];
      }
      loadingTrees.value = false;
    }

    function updateActiveTreeName() {
      const active = trees.value.find((t) => t.id === props.activeTreeId);
      activeTreeName.value = active?.name || '';
    }

    function toggleDropdown() {
      isOpen.value = !isOpen.value;
      if (isOpen.value) fetchTrees();
    }

    function handleClickOutside(e) {
      if (switcherRef.value && !switcherRef.value.contains(e.target)) {
        isOpen.value = false;
      }
    }

    function switchTree(tree) {
      if (tree.id === props.activeTreeId) {
        isOpen.value = false;
        return;
      }
      isOpen.value = false;
      router.push(`/trusted/goals/${tree.id}`);
      emit('tree-switched', tree.id);
    }

    // Rename
    function startRename(tree) {
      renameTarget.value = tree;
      renameValue.value = tree.name;
      renameError.value = null;
      showRename.value = true;
      isOpen.value = false;
      nextTick(() => {
        renameInput.value?.focus();
        renameInput.value?.select();
      });
    }

    async function submitRename() {
      if (!renameValue.value.trim() || !renameTarget.value) return;
      renaming.value = true;
      renameError.value = null;
      try {
        await axios.patch(`/api/goals/trees/${renameTarget.value.id}`, {
          name: renameValue.value.trim(),
        });
        showRename.value = false;
        await fetchTrees();
        emit('tree-renamed', renameTarget.value.id, renameValue.value.trim());
        renameTarget.value = null;
        renameValue.value = '';
      } catch (err) {
        renameError.value = err.response?.data?.error?.message || err.message;
      }
      renaming.value = false;
    }

    function cancelRename() {
      showRename.value = false;
      renameTarget.value = null;
      renameValue.value = '';
      renameError.value = null;
    }

    // Create
    function startCreate() {
      createValue.value = '';
      createError.value = null;
      showCreate.value = true;
      isOpen.value = false;
      nextTick(() => createInput.value?.focus());
    }

    async function submitCreate() {
      if (!createValue.value.trim()) return;
      creating.value = true;
      createError.value = null;
      try {
        const resp = await axios.post('/api/goals/trees', { name: createValue.value.trim() });
        showCreate.value = false;
        createValue.value = '';
        await fetchTrees();
        const newTree = resp.data;
        router.push(`/trusted/goals/${newTree.id}`);
        emit('tree-created', newTree.id);
      } catch (err) {
        createError.value = err.response?.data?.error?.message || err.message;
      }
      creating.value = false;
    }

    function cancelCreate() {
      showCreate.value = false;
      createValue.value = '';
      createError.value = null;
    }

    // Delete
    function startDelete(tree) {
      deleteTarget.value = tree;
      deleteError.value = null;
      showDelete.value = true;
      isOpen.value = false;
    }

    async function submitDelete() {
      if (!deleteTarget.value) return;
      deleting.value = true;
      deleteError.value = null;
      try {
        await axios.delete(`/api/goals/trees/${deleteTarget.value.id}`);
        const deletedId = deleteTarget.value.id;
        showDelete.value = false;
        deleteTarget.value = null;
        await fetchTrees();
        emit('tree-deleted', deletedId);
        if (deletedId === props.activeTreeId) {
          if (trees.value.length > 0) {
            router.push(`/trusted/goals/${trees.value[0].id}`);
          } else {
            router.push('/trusted/goals');
          }
        }
      } catch (err) {
        deleteError.value = err.response?.data?.error?.message || err.message;
      }
      deleting.value = false;
    }

    function cancelDelete() {
      showDelete.value = false;
      deleteTarget.value = null;
      deleteError.value = null;
    }

    watch(() => props.activeTreeId, updateActiveTreeName);

    onMounted(() => {
      document.addEventListener('click', handleClickOutside);
      fetchTrees();
    });

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside);
    });

    return {
      switcherRef,
      isOpen,
      trees,
      loadingTrees,
      activeTreeName,
      toggleDropdown,
      switchTree,

      showRename,
      renameTarget,
      renameValue,
      renaming,
      renameError,
      renameInput,
      startRename,
      submitRename,
      cancelRename,

      showCreate,
      createValue,
      creating,
      createError,
      createInput,
      startCreate,
      submitCreate,
      cancelCreate,

      showDelete,
      deleteTarget,
      deleting,
      deleteError,
      startDelete,
      submitDelete,
      cancelDelete,
    };
  },
};
</script>

<style scoped>
.tree-switcher {
  position: relative;
}

.switcher-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  background-color: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  color: var(--text-on-dark);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--transition-moderate);
  max-width: 240px;
}

.switcher-trigger:hover {
  border-color: var(--text-muted);
}

.trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-arrow {
  font-size: var(--text-xs);
  color: var(--text-muted);
  transition: transform var(--transition-moderate);
}

.trigger-arrow.open {
  transform: rotate(180deg);
}

.switcher-dropdown {
  position: absolute;
  top: calc(100% + var(--space-xs));
  left: 0;
  min-width: 260px;
  max-width: 320px;
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 100;
  overflow: hidden;
}

.dropdown-list {
  max-height: 280px;
  overflow-y: auto;
  padding: var(--space-xs);
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-moderate);
}

.dropdown-item:hover {
  background-color: var(--surface-card-inner);
}

.dropdown-item.active {
  background-color: var(--surface-card-inner);
  border-left: 3px solid var(--brand-primary);
  padding-left: calc(var(--space-md) - 3px);
}

.item-name {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.dropdown-item.active .item-name {
  color: var(--brand-primary);
  font-weight: 600;
}

.item-actions {
  display: flex;
  gap: var(--space-2xs);
  opacity: 0;
  transition: opacity var(--transition-moderate);
}

.dropdown-item:hover .item-actions {
  opacity: 1;
}

.btn-item-action {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  padding: var(--space-2xs);
  border-radius: var(--radius-sm);
  transition: color var(--transition-moderate), background-color var(--transition-moderate);
}

.btn-item-action:hover {
  color: var(--text-on-dark);
  background-color: var(--border-card);
}

.btn-item-delete:hover {
  color: var(--feedback-error);
}

.dropdown-empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: var(--space-md);
  text-align: center;
}

.btn-new-tree {
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-top: 1px solid var(--border-card);
  color: var(--brand-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--transition-moderate);
}

.btn-new-tree:hover {
  background-color: var(--surface-card-inner);
}

/* Dialog styles */
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

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
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
</style>
