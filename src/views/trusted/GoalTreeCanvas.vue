<template>
  <div class="canvas-view">
    <div class="canvas-toolbar">
      <button class="btn-back" @click="goBack">&#8592; Trees</button>
      <TreeSwitcher
        :activeTreeId="treeId"
        @tree-renamed="onTreeRenamed"
        @tree-switched="onTreeSwitched"
      />
      <div class="toolbar-spacer"></div>
      <button class="btn-add-node" @click="showCreateNode = true">+ Add Node</button>
    </div>

    <div v-if="loading" class="loading-text">Loading tree...</div>
    <div v-else-if="error" class="error-text">{{ error }}</div>
    <div v-else class="canvas-wrapper">
      <Canvas
        :nodes="nodes"
        :edges="edges"
        @node-click="selectNode"
        @node-repositioned="onNodeRepositioned"
      />
    </div>

    <!-- Node creation dialog -->
    <div v-if="showCreateNode" class="dialog-overlay" @click.self="showCreateNode = false">
      <div class="dialog">
        <h3>Add Node</h3>
        <input
          v-model="newNode.name"
          placeholder="Node name"
          @keyup.enter="createNode"
          @keyup.escape="showCreateNode = false"
          maxlength="255"
          ref="createNodeInput"
        />
        <div class="form-row">
          <label>Type</label>
          <select v-model="newNode.type">
            <option value="goal">Goal</option>
            <option value="milestone">Milestone</option>
            <option value="step">Step</option>
          </select>
        </div>
        <div class="form-row">
          <label>Parent</label>
          <select v-model="newNode.parent_id">
            <option :value="null">None (root)</option>
            <option v-for="node in nodes" :key="node.id" :value="node.id">
              {{ node.name }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>Color</label>
          <input type="color" v-model="newNode.color" />
        </div>
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showCreateNode = false">Cancel</button>
          <button
            class="btn-confirm"
            @click="createNode"
            :disabled="creating || !newNode.name.trim()"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Canvas from '../../components/goals/Canvas.vue';
import TreeSwitcher from '../../components/goals/TreeSwitcher.vue';
import { useGoalNodes } from '../../composables/goals/useGoalNodes.js';

export default {
  components: { Canvas, TreeSwitcher },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const treeId = computed(() => route.params.id);

    const { nodes, edges, loading, error, fetchNodes, createNode: apiCreateNode, updateSortOrder } =
      useGoalNodes(treeId);

    const showCreateNode = ref(false);
    const creating = ref(false);
    const createError = ref(null);
    const createNodeInput = ref(null);
    const newNode = ref({
      name: '',
      type: 'step',
      parent_id: null,
      color: '#ffb300',
    });

    function onTreeRenamed() {
      // TreeSwitcher handles name display; no action needed
    }

    function onTreeSwitched() {
      // Route change triggers watcher which reloads nodes
    }

    async function createNode() {
      if (!newNode.value.name.trim()) return;
      creating.value = true;
      createError.value = null;
      try {
        await apiCreateNode({
          name: newNode.value.name.trim(),
          type: newNode.value.type,
          parent_id: newNode.value.parent_id,
          color: newNode.value.color,
        });
        showCreateNode.value = false;
        newNode.value = { name: '', type: 'step', parent_id: null, color: '#ffb300' };
      } catch (err) {
        createError.value = err.response?.data?.error?.message || err.message;
      }
      creating.value = false;
    }

    function selectNode(nodeId) {
      // Future: open detail panel
    }

    function onNodeRepositioned({ nodeId, position }) {
      const sortOrder = Math.round(position.y);
      updateSortOrder(nodeId, sortOrder);
    }

    function goBack() {
      router.push('/trusted/goals');
    }

    watch(showCreateNode, (val) => {
      if (val) nextTick(() => createNodeInput.value?.focus());
    });

    onMounted(() => {
      if (treeId.value) {
        fetchNodes();
      }
    });

    watch(treeId, (val) => {
      if (val) {
        fetchNodes();
      }
    });

    return {
      treeId,
      nodes,
      edges,
      loading,
      error,
      showCreateNode,
      creating,
      createError,
      createNodeInput,
      newNode,
      createNode,
      selectNode,
      onNodeRepositioned,
      onTreeRenamed,
      onTreeSwitched,
      goBack,
    };
  },
};
</script>

<style scoped>
.canvas-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  padding: var(--space-md);
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  flex-shrink: 0;
}

.btn-back {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: color var(--transition-moderate);
}

.btn-back:hover {
  color: var(--text-on-light);
  border-color: var(--text-on-light);
}

.toolbar-spacer {
  flex: 1;
}

.btn-add-node {
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

.btn-add-node:hover {
  filter: brightness(1.15);
}

.canvas-wrapper {
  flex: 1;
  border-radius: var(--radius-xl);
  border: 2px solid var(--border-card);
  overflow: hidden;
}

.loading-text {
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-xl);
  font-size: var(--text-lg);
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

/* Dialog styles (shared with Goals.vue patterns) */
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

.dialog input[type="text"],
.dialog input:not([type]) {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-base);
  box-sizing: border-box;
}

.form-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.form-row label {
  color: var(--text-muted);
  font-size: var(--text-sm);
  min-width: 60px;
}

.form-row select {
  flex: 1;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.form-row input[type="color"] {
  width: 40px;
  height: 30px;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
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
}

.btn-confirm:hover:not(:disabled) {
  filter: brightness(1.15);
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
