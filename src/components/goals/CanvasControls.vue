<template>
  <div class="canvas-controls">
    <AspTooltip content="Zoom in" position="left">
      <button class="control-btn" aria-label="Zoom in" @click="$emit('zoom-in')">+</button>
    </AspTooltip>
    <AspTooltip content="Zoom out" position="left">
      <button class="control-btn" aria-label="Zoom out" @click="$emit('zoom-out')">&minus;</button>
    </AspTooltip>
    <AspTooltip content="Fit view" position="left">
      <button class="control-btn" aria-label="Fit view" @click="$emit('fit-view')">&#8862;</button>
    </AspTooltip>
    <AspTooltip content="Reset" position="left">
      <button class="control-btn" aria-label="Reset" @click="$emit('reset')">&#8634;</button>
    </AspTooltip>
  </div>
</template>

<script>
import { AspTooltip } from '@aspirant/design-system';

export default {
  components: { AspTooltip },
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
  color: var(--text-on-fixed-light);
}
</style>
