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
      <button class="btn-add-node" @click="openCreateDialog(null)">+ Add Node</button>
    </div>

    <TimelineFilter
      :period="filterPeriod"
      :customStart="filterCustomStart"
      :customEnd="filterCustomEnd"
      :mode="filterMode"
      :active="filterActive"
      @update:period="filterPeriod = $event"
      @update:customStart="filterCustomStart = $event"
      @update:customEnd="filterCustomEnd = $event"
      @update:mode="filterMode = $event"
      @apply="applyFilter"
      @clear="clearFilter"
    />

    <div v-if="loading" class="loading-text">Loading tree...</div>
    <div v-else-if="error" class="error-text">{{ error }}</div>
    <div v-else class="canvas-wrapper">
      <Canvas
        :nodes="nodes"
        :edges="edges"
        :dimmedNodeIds="dimmedNodeIds"
        @node-click="selectNode"
        @node-repositioned="onNodeRepositioned"
        @node-context="onNodeContext"
      />
    </div>

    <!-- Node detail panel -->
    <NodeDetailPanel
      :node="selectedNode"
      :treeId="treeId"
      @close="selectedNode = null"
      @node-updated="onNodeUpdated"
    />

    <!-- Node creation dialog -->
    <div v-if="showCreateNode" class="dialog-overlay" @click.self="showCreateNode = false">
      <div class="dialog dialog-wide">
        <h3>Add Node</h3>
        <input
          v-model="newNode.name"
          placeholder="Node name"
          @keyup.escape="showCreateNode = false"
          maxlength="255"
          ref="createNodeInput"
        />
        <div class="form-row">
          <label>Type</label>
          <select v-model="newNode.type" @change="onTypeChange">
            <option value="goal">Goal</option>
            <option value="milestone">Milestone</option>
            <option value="step">Step</option>
          </select>
        </div>
        <div class="form-row">
          <label>Parent</label>
          <select v-model="newNode.parent_id" @change="onParentChange">
            <option :value="null">None (root)</option>
            <option v-for="node in nodes" :key="node.id" :value="node.id">
              {{ node.name }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>Planned start</label>
          <input type="date" v-model="newNode.planned_start" />
        </div>
        <div class="form-row">
          <label>Planned end</label>
          <input type="date" v-model="newNode.planned_end" />
        </div>
        <div class="form-row">
          <label>Color</label>
          <input type="color" v-model="newNode.color" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea
            v-model="newNode.description"
            rows="8"
            class="description-textarea"
            placeholder="Markdown description..."
          ></textarea>
        </div>
        <div v-if="depthWarning" class="warning-banner">
          &#9888; Recommended depth reached. Adding further nesting may reduce clarity.
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
import NodeDetailPanel from '../../components/goals/NodeDetailPanel.vue';
import TimelineFilter from '../../components/goals/TimelineFilter.vue';
import { useGoalNodes } from '../../composables/goals/useGoalNodes.js';
import { useTimelineFilter } from '../../composables/goals/useTimelineFilter.js';

const NODE_TEMPLATES = {
  goal: `## Outcome\n\nWhat does success look like when this goal is achieved?\n\n## Motivation\n\nWhy does this goal matter? What changes if it's completed?\n\n## Key Results\n\n- [ ] \n- [ ] \n- [ ] \n`,
  milestone: `## Definition\n\nWhat marks this milestone as reached?\n\n## Dependencies\n\nWhat must be true before this milestone can be achieved?\n\n## Evidence\n\nHow will completion be verified?\n`,
  step: `## Action\n\nWhat concrete action does this step represent?\n\n## Done When\n\nHow do you know this step is complete?\n`,
};

const MAX_RECOMMENDED_DEPTH = 5;

export default {
  components: { Canvas, TreeSwitcher, NodeDetailPanel, TimelineFilter },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const treeId = computed(() => route.params.id);

    const { nodes, edges, loading, error, fetchNodes, createNode: apiCreateNode, updateSortOrder } =
      useGoalNodes(treeId);

    const {
      period: filterPeriod,
      customStart: filterCustomStart,
      customEnd: filterCustomEnd,
      mode: filterMode,
      active: filterActive,
      dimmedNodeIds,
      apply: applyFilter,
      clear: clearFilter,
    } = useTimelineFilter(nodes);

    const selectedNode = ref(null);

    const showCreateNode = ref(false);
    const creating = ref(false);
    const createError = ref(null);
    const createNodeInput = ref(null);
    const newNode = ref(defaultNodeState());

    function defaultNodeState() {
      return {
        name: '',
        type: 'step',
        parent_id: null,
        color: '#ffb300',
        planned_start: '',
        planned_end: '',
        description: NODE_TEMPLATES.step,
      };
    }

    function getNodeDepth(nodeId) {
      if (!nodeId) return 0;
      let depth = 0;
      let current = nodeId;
      const edgeList = edges.value;
      while (current) {
        const parentEdge = edgeList.find((e) => e.to_id === current);
        if (!parentEdge) break;
        current = parentEdge.from_id;
        depth++;
      }
      return depth;
    }

    const depthWarning = computed(() => {
      const parentDepth = getNodeDepth(newNode.value.parent_id);
      return parentDepth + 1 >= MAX_RECOMMENDED_DEPTH;
    });

    function openCreateDialog(parentId) {
      newNode.value = defaultNodeState();
      if (parentId) {
        newNode.value.parent_id = parentId;
      }
      createError.value = null;
      showCreateNode.value = true;
    }

    function onTypeChange() {
      newNode.value.description = NODE_TEMPLATES[newNode.value.type] || '';
    }

    function onParentChange() {
      // Recalculate depth warning reactively via computed
    }

    function onNodeContext(nodeId) {
      openCreateDialog(nodeId);
    }

    function onTreeRenamed() {}

    function onTreeSwitched() {}

    async function createNode() {
      if (!newNode.value.name.trim()) return;
      creating.value = true;
      createError.value = null;
      try {
        const payload = {
          name: newNode.value.name.trim(),
          type: newNode.value.type,
          parent_id: newNode.value.parent_id,
          color: newNode.value.color,
          description: newNode.value.description || '',
        };
        if (newNode.value.planned_start) payload.planned_start = newNode.value.planned_start + 'T00:00:00Z';
        if (newNode.value.planned_end) payload.planned_end = newNode.value.planned_end + 'T00:00:00Z';

        await apiCreateNode(payload);
        showCreateNode.value = false;
        newNode.value = defaultNodeState();
      } catch (err) {
        const status = err.response?.status;
        const data = err.response?.data;
        if (status === 422) {
          createError.value = data?.error?.message || data?.detail || 'Validation failed: maximum nesting depth exceeded.';
        } else {
          createError.value = data?.error?.message || err.message;
        }
      }
      creating.value = false;
    }

    function selectNode(nodeId) {
      const found = nodes.value.find((n) => String(n.id) === String(nodeId));
      selectedNode.value = found || null;
    }

    function onNodeUpdated() {
      fetchNodes().then(() => {
        if (selectedNode.value) {
          const refreshed = nodes.value.find((n) => n.id === selectedNode.value.id);
          selectedNode.value = refreshed || null;
        }
      });
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
      selectedNode,
      showCreateNode,
      creating,
      createError,
      createNodeInput,
      newNode,
      depthWarning,
      filterPeriod,
      filterCustomStart,
      filterCustomEnd,
      filterMode,
      filterActive,
      dimmedNodeIds,
      applyFilter,
      clearFilter,
      openCreateDialog,
      onTypeChange,
      onParentChange,
      onNodeContext,
      createNode,
      selectNode,
      onNodeUpdated,
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
  max-height: 90vh;
  overflow-y: auto;
}

.dialog.dialog-wide {
  max-width: 540px;
}

.dialog h3 {
  color: var(--text-heading-card);
  font-size: var(--text-lg);
  margin: 0 0 var(--space-md) 0;
}

.dialog input[type="text"],
.dialog input:not([type="color"]):not([type="date"]) {
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
  min-width: 90px;
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

.form-row input[type="date"] {
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

.form-group {
  margin-top: var(--space-md);
}

.form-group label {
  display: block;
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-xs);
}

.description-textarea {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
  line-height: 1.5;
}

.warning-banner {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  border: 1px solid var(--feedback-warning, #f5a623);
  background-color: rgba(245, 166, 35, 0.1);
  color: var(--feedback-warning, #f5a623);
  font-size: var(--text-sm);
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
