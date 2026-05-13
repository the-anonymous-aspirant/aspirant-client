<template>
  <div class="canvas-container">
    <VueFlow
      id="goal-canvas"
      :nodes="layoutedNodes"
      :edges="flowEdges"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :min-zoom="0.2"
      :max-zoom="3"
      :fit-view-on-init="true"
      :nodes-draggable="true"
      :pan-on-drag="true"
      :zoom-on-scroll="true"
      @node-drag-stop="onNodeDragStop"
      @node-click="onNodeClick"
      @node-context-menu="onNodeContextMenu"
    >
      <template #node-goalNode="nodeProps">
        <CanvasNode :data="nodeProps.data" />
      </template>

      <CanvasControls
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @fit-view="handleFitView"
        @reset="resetView"
      />
    </VueFlow>
  </div>
</template>

<script>
import { computed } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import CanvasNode from './CanvasNode.vue';
import CanvasControls from './CanvasControls.vue';
import { useCanvasLayout } from '../../composables/goals/useCanvasLayout.js';

export default {
  components: { VueFlow, CanvasNode, CanvasControls },
  props: {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    dimmedNodeIds: { type: Object, default: () => new Set() },
  },
  emits: ['node-click', 'node-repositioned', 'node-context'],
  setup(props, { emit }) {
    const { zoomIn, zoomOut, fitView, setViewport } = useVueFlow({ id: 'goal-canvas' });
    const { computeLayout } = useCanvasLayout();

    const nodeColorMap = computed(() => {
      const map = {};
      for (const node of props.nodes) {
        map[node.id] = node.resolved_color || node.color || '#ffb300';
      }
      return map;
    });

    const flowEdges = computed(() =>
      props.edges.map((edge) => ({
        id: edge.id,
        source: edge.from_id,
        target: edge.to_id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: nodeColorMap.value[edge.from_id] || '#ffb300', strokeWidth: 2 },
      }))
    );

    const flowNodes = computed(() =>
      props.nodes.map((node) => ({
        id: node.id,
        type: 'goalNode',
        data: { ...node, dimmed: props.dimmedNodeIds.has(node.id) },
        position: { x: 0, y: 0 },
      }))
    );

    const layoutedNodes = computed(() => {
      if (flowNodes.value.length === 0) return [];
      return computeLayout(flowNodes.value, flowEdges.value);
    });

    function handleFitView() {
      fitView({ padding: 0.2 });
    }

    function resetView() {
      setViewport({ x: 0, y: 0, zoom: 1 });
    }

    function onNodeDragStop(event) {
      emit('node-repositioned', {
        nodeId: event.node.id,
        position: event.node.position,
      });
    }

    function onNodeClick(event) {
      emit('node-click', event.node.id);
    }

    function onNodeContextMenu(event) {
      event.event.preventDefault();
      emit('node-context', event.node.id);
    }

    return {
      flowEdges,
      layoutedNodes,
      zoomIn,
      zoomOut,
      handleFitView,
      resetView,
      onNodeDragStop,
      onNodeClick,
      onNodeContextMenu,
    };
  },
};
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
  background-color: var(--surface-page);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
</style>
