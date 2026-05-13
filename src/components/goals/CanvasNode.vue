<template>
  <div class="goal-node" :class="{ completed: !!data.completed_at, dimmed: data.dimmed }">
    <Handle type="target" :position="Position.Top" />
    <div class="color-bar" :style="{ backgroundColor: resolvedColor }"></div>
    <div class="node-body">
      <div class="node-header">
        <span class="type-icon">{{ typeIcon }}</span>
        <span class="node-name">{{ data.name }}</span>
      </div>
      <div class="node-footer">
        <span class="node-type-label">{{ data.type }}</span>
        <span v-if="data.completed_at" class="completion-badge">&#10003;</span>
        <span v-else-if="childProgress !== null" class="progress-text">
          {{ childProgress }}
        </span>
      </div>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script>
import { Handle, Position } from '@vue-flow/core';

export default {
  components: { Handle },
  props: {
    data: { type: Object, required: true },
  },
  computed: {
    resolvedColor() {
      return this.data.resolved_color || this.data.color || '#ffb300';
    },
    typeIcon() {
      switch (this.data.type) {
        case 'goal': return '★';
        case 'milestone': return '◆';
        case 'step': return '●';
        default: return '○';
      }
    },
    childProgress() {
      if (this.data.total_children == null || this.data.total_children === 0) return null;
      return `${this.data.completed_children || 0}/${this.data.total_children}`;
    },
  },
};
</script>

<style scoped>
.goal-node {
  display: flex;
  width: 220px;
  min-height: 70px;
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: grab;
  transition: box-shadow var(--transition-moderate), transform var(--transition-moderate);
}

.goal-node:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.goal-node.completed {
  opacity: 0.7;
  border-color: var(--feedback-success);
}

.goal-node.dimmed {
  opacity: 0.3;
  filter: grayscale(0.6);
  pointer-events: auto;
}

.color-bar {
  width: 6px;
  flex-shrink: 0;
}

.node-body {
  flex: 1;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-icon {
  font-size: 14px;
  color: var(--brand-primary);
  flex-shrink: 0;
}

.node-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-on-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-type-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: capitalize;
}

.completion-badge {
  font-size: 12px;
  color: var(--feedback-success);
  font-weight: bold;
}

.progress-text {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
