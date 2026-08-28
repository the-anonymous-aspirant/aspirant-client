<template>
  <div class="canvas-controls">
    <AspTooltip content="Zoom in" position="left">
      <AspButton variant="secondary" size="icon" aria-label="Zoom in" @click="$emit('zoom-in')">+</AspButton>
    </AspTooltip>
    <AspTooltip content="Zoom out" position="left">
      <AspButton variant="secondary" size="icon" aria-label="Zoom out" @click="$emit('zoom-out')">&minus;</AspButton>
    </AspTooltip>
    <AspTooltip content="Fit view" position="left">
      <AspButton variant="secondary" size="icon" aria-label="Fit view" @click="$emit('fit-view')">&#8862;</AspButton>
    </AspTooltip>
    <AspTooltip content="Reset" position="left">
      <AspButton variant="secondary" size="icon" aria-label="Reset" @click="$emit('reset')">&#8634;</AspButton>
    </AspTooltip>
  </div>
</template>

<script>
import { AspButton, AspTooltip } from '@aspirant/design-system';

export default {
  components: { AspButton, AspTooltip },
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

/* The four controls are AspButton size="icon" (a fixed 44px square, §3.23
   rule-4 touch floor) with variant="secondary" — the DS owns their paint,
   border, hover and focus ring. This block is layout only: a local rule on the
   button itself would land on the DS root element and override the size pin
   and the variant, which is the port hazard #4323/#4324 both measured. */
</style>
