<template>
  <div class="canvas-view">
    <div class="canvas-toolbar">
      <!-- Ghost, not AspBackButton. `goBack()` is an unconditional
           `router.push('/member/shared/goals')` — it always lands on the Trees
           list, which is what the label promises. AspBackButton pops history
           when there is an in-app entry to pop, and on a canvas reached through
           the tree switcher that entry is another TREE, so it would send
           "Trees" somewhere that is not Trees. Ghost is also how the DS itself
           paints a back affordance (AspBackButton: no background, muted ink,
           transparent border), so the family reads the same. #4460. -->
      <AspButton variant="ghost" class="btn-back" @click="goBack">&#8592; Trees</AspButton>
      <TreeSwitcher
        :activeTreeId="treeId"
        @tree-renamed="onTreeRenamed"
        @tree-switched="onTreeSwitched"
      />
      <div class="toolbar-spacer"></div>
      <AspButton variant="primary" @click="openCreateDialog(null)">+ Add Node</AspButton>
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
    <div v-if="showCreateNode" v-overlay-history="() => (showCreateNode = false)" class="dialog-overlay" @click.self="showCreateNode = false">
      <div class="dialog dialog-wide">
        <h3>Add Node</h3>
        <!-- ref kept verbatim: `createNodeInput.value?.focus()` (L~274) reaches
             the inner <input> through AspInput's defineExpose (#4303). Without
             it the ref resolves to the component instance and opening this
             dialog would silently stop putting the caret in the name field. -->
        <AspInput
          ref="createNodeInput"
          v-model="newNode.name"
          placeholder="Node name"
          maxlength="255"
          @keyup.escape="showCreateNode = false"
        />
        <div class="form-row">
          <label>Type</label>
          <!-- v-model is spelled out: the native paired v-model with @change and
               AspSelect emits only update:modelValue, so the assignment and the
               template swap both hang off that one event, in that order. -->
          <AspSelect
            class="form-row-control"
            :model-value="newNode.type"
            :options="typeOptions"
            aria-label="Type"
            @update:model-value="v => { newNode.type = v; onTypeChange(); }"
          />
        </div>
        <div class="form-row">
          <label>Parent</label>
          <AspSelect
            class="form-row-control"
            v-model="newNode.parent_id"
            :options="parentOptions"
            aria-label="Parent"
          />
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
          <AspTextarea
            v-model="newNode.description"
            aria-label="Description"
            :rows="8"
            :max-rows="16"
            placeholder="Markdown description..."
          />
        </div>
        <div v-if="depthWarning" class="warning-banner">
          &#9888; Recommended depth reached. Adding further nesting may reduce clarity.
        </div>
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="showCreateNode = false">Cancel</AspButton>
          <AspButton
            variant="primary"
            @click="createNode"
            :disabled="creating || !newNode.name.trim()"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </AspButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { AspButton, AspInput, AspSelect, AspTextarea } from '@aspirant/design-system';

import Canvas from '../../../components/goals/Canvas.vue';
import TreeSwitcher from '../../../components/goals/TreeSwitcher.vue';
import NodeDetailPanel from '../../../components/goals/NodeDetailPanel.vue';
import TimelineFilter from '../../../components/goals/TimelineFilter.vue';
import { useGoalNodes } from '../../../composables/goals/useGoalNodes.js';
import { useTimelineFilter } from '../../../composables/goals/useTimelineFilter.js';

const NODE_TEMPLATES = {
  goal: `## Outcome\n\nWhat does success look like when this goal is achieved?\n\n## Motivation\n\nWhy does this goal matter? What changes if it's completed?\n\n## Key Results\n\n- [ ] \n- [ ] \n- [ ] \n`,
  milestone: `## Definition\n\nWhat marks this milestone as reached?\n\n## Dependencies\n\nWhat must be true before this milestone can be achieved?\n\n## Evidence\n\nHow will completion be verified?\n`,
  step: `## Action\n\nWhat concrete action does this step represent?\n\n## Done When\n\nHow do you know this step is complete?\n`,
};

const MAX_RECOMMENDED_DEPTH = 5;

export default {
  components: { AspButton, AspInput, AspSelect, AspTextarea, Canvas, TreeSwitcher, NodeDetailPanel, TimelineFilter },
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

    // AspSelect takes `[{value,label}]` where the natives took <option> markup.
    // Values keep the native's types: the root entry is `null` (what the API
    // takes for parent_id) and node ids are numbers — a <select> would have
    // coerced the ids to strings, this does not.
    const typeOptions = [
      { value: 'goal', label: 'Goal' },
      { value: 'milestone', label: 'Milestone' },
      { value: 'step', label: 'Step' },
    ];
    const parentOptions = computed(() => [
      { value: null, label: 'None (root)' },
      ...nodes.value.map((node) => ({ value: node.id, label: node.name })),
    ]);

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
      router.push('/member/shared/goals');
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
      typeOptions,
      parentOptions,
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

/* Layout only. Fill, ink, radius, border, focus and hover are AspButton's now;
   a scoped `.btn-back { color/border/padding }` block would fall through to the
   DS button root and override the component it just adopted (the scoped-
   selector footgun that bit the earlier AspButton slices). Nothing here needs
   to survive — the toolbar's flex gap does the spacing — so the class stays
   only as a hook for anything a later layout tweak needs. */

.toolbar-spacer {
  flex: 1;
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

/* The name field is AspInput, the Type/Parent pickers are AspSelect and the
   description is AspTextarea — the DS paints all four past this file's data-v
   attribute. (An earlier note here said the selects and the textarea could not
   migrate because `select` was a family #4278 did not cover; that was a
   statement about that census, not about the DS — AspSelect and AspTextarea
   have shipped throughout.) What is still native is the two `date` pickers and
   the `color` picker: native-widget types the §3.85 ruling excludes from
   AspInput's contract on purpose, with no DS component of their own. Instead of
   leaving them at a different height, radius, fill and boundary beside four DS
   controls, they are held to the box the DS renders. §3.86: an always-live
   data-entry control on a dark card adopts the DS control fill.

   The box is `34px | 8px radius | --surface-elevated | --border-control`, which
   is what AspInput's .field__control and AspSelect's .select__trigger both
   declare, so the retained rule below is the same values the DS uses — not a
   guess at them. The contrast reasoning from the original measurement still
   holds for the natives (light: near-white fill on the #424242 card carries the
   boundary at 9.55:1; dark: the #cccccc border carries it at 8.94:1); the
   #4478 evidence set re-measures the dialog with the DS controls in place.

   The `color` swatch keeps its own 40×30 box: it is a swatch, not a field, and
   stretching it to a 34px text-control box would claim it is one. */

/* AspInput's .field__control declares height but not box-sizing, so it
   rendered content-box (34px content + 2px border = 36px) once #4294 removed
   Vuetify's global `box-sizing: border-box` reset that had masked this for
   every AspInput on the page. The date rule below sets box-sizing explicitly,
   which is why only the DS control disagreed. Filed as its own
   task (system_3 task #4330) since the gap is DS-wide, not local to this
   dialog; scoped here so this dialog's box stays correct in the meantime. */
:deep(.dialog .field__control) {
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

/* AspSelect's root is a single node, so a class passed to it does land there
   (with this file's scope id) — unlike AspTextarea, whose inheritAttrs:false
   delivers a class to the inner <textarea>. flex: 1 is the only thing the DS
   cannot know: this control shares its row with a 90px caption. */
.form-row .form-row-control {
  flex: 1;
}

.form-row input[type="date"] {
  flex: 1;
  height: 34px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-control);
  background-color: var(--surface-elevated);
  color: var(--text-body);
  font-family: inherit;
  font-size: var(--text-sm);
  box-sizing: border-box;
}

.form-row input[type="color"] {
  width: 40px;
  height: 30px;
  border: 1px solid var(--border-control);
  border-radius: var(--radius-md);
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

/* The description box is AspTextarea's now; only the typeface is this file's
   call. Monospace is kept deliberately — this field takes Markdown, and the
   fixed advance is what makes a fenced block or a table line up as typed.
   :deep() because the real <textarea> sits past this file's scope id; the
   selector is anchored on the parent-owned .form-group so it reaches nothing
   outside this dialog. */
.form-group :deep(.field__textarea) {
  font-family: monospace;
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


</style>
