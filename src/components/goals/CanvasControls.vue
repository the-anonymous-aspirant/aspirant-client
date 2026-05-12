<template>
  <div class="canvas-controls">
    <button class="control-btn" @click="$emit('zoom-in')" title="Zoom in">+</button>
    <button class="control-btn" @click="$emit('zoom-out')" title="Zoom out">&minus;</button>
    <button class="control-btn" @click="$emit('fit-view')" title="Fit view">&#8862;</button>
    <button class="control-btn" @click="$emit('reset')" title="Reset">&#8634;</button>
  </div>
</template>

<script>
export default {
  emits: ['zoom-in', 'zoom-out', 'fit-view', 'reset'],
};
</script>

<style scoped>
.canvas-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-on-dark);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  transition: background-color var(--transition-fast);
}

.control-btn:hover {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
}
</style>
