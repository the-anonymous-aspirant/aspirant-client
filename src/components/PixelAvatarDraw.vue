<script>
  import { ref, computed } from 'vue';

  // PixelAvatarDraw — a small in-browser pixel-drawing surface for the profile
  // avatar (#4202, operator ask on #3617: "draw their own icons in a little
  // circle"). The user paints cells on a fixed grid, then Save rasterizes the
  // grid to a PNG which the parent uploads through the existing avatar endpoint
  // (PUT /api/profile/avatar, #4170). UserAvatar renders it inside its circular
  // mask for free, so the square drawing shows as a round icon.
  //
  // Scope note (§3.44 design-system-first): this is an app-specific feature
  // surface, not a reusable DS primitive — there is no pixel-canvas primitive in
  // @aspirant/design-system and one is not warranted for a single profile
  // affordance. The component styles its chrome with DS tokens (spacing, radius,
  // colours) but owns the drawing grid itself. The DRAW_PALETTE below is a
  // pixel-art colour set the user paints WITH — distinct from the brand UI
  // tokens that style the surrounding controls.
  const DRAW_PALETTE = [
    '#000000', // black
    '#ffffff', // white
    '#e53935', // red
    '#fb8c00', // orange
    '#fdd835', // yellow
    '#43a047', // green
    '#1e88e5', // blue
    '#8e24aa', // purple
  ];

  // Painted cells rasterize at this many px per cell, so the exported PNG is
  // crisp (24×24 grid → 288×288 image) rather than a blurry 24px upscale.
  const CELL_PX = 12;
  // Empty cells fall back to this background in the exported PNG, so the drawing
  // reads clearly wherever the avatar is shown (over the brand-tinted mask).
  const BG_COLOR = '#ffffff';

  export default {
    name: 'PixelAvatarDraw',
    props: {
      // Grid is square: gridSize × gridSize cells.
      gridSize: { type: Number, default: 24 },
      // Disables the controls while the parent is uploading.
      busy: { type: Boolean, default: false },
    },
    emits: ['save', 'cancel'],
    setup(props, { emit }) {
      const total = computed(() => props.gridSize * props.gridSize);
      // null ⇒ empty cell (exports as BG_COLOR); otherwise a palette colour.
      const cells = ref(Array(total.value).fill(null));
      const selected = ref(DRAW_PALETTE[0]);
      const erasing = ref(false);
      const painting = ref(false);

      const hasDrawing = computed(() => cells.value.some((c) => c !== null));

      const paintAt = (idx) => {
        if (idx == null || idx < 0 || idx >= cells.value.length) return;
        const next = cells.value.slice();
        next[idx] = erasing.value ? null : selected.value;
        cells.value = next;
      };

      // Resolve the grid cell under a pointer position. Touch drag does not fire
      // per-cell pointerenter (the initial target captures the gesture), so we
      // hit-test with elementFromPoint on every move — one path for mouse+touch.
      const cellIndexFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el || !el.classList || !el.classList.contains('pixel-cell')) return null;
        const idx = el.getAttribute('data-idx');
        return idx == null ? null : Number(idx);
      };

      const onPointerDown = (e) => {
        if (props.busy) return;
        painting.value = true;
        paintAt(cellIndexFromPoint(e.clientX, e.clientY));
      };
      const onPointerMove = (e) => {
        if (!painting.value) return;
        paintAt(cellIndexFromPoint(e.clientX, e.clientY));
      };
      const stopPainting = () => {
        painting.value = false;
      };

      const pickColor = (color) => {
        selected.value = color;
        erasing.value = false;
      };
      const pickEraser = () => {
        erasing.value = true;
      };
      const clearAll = () => {
        cells.value = Array(total.value).fill(null);
      };

      const save = () => {
        if (!hasDrawing.value || props.busy) return;
        const size = props.gridSize * CELL_PX;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < cells.value.length; i++) {
          const color = cells.value[i];
          if (!color) continue;
          const col = i % props.gridSize;
          const row = Math.floor(i / props.gridSize);
          ctx.fillStyle = color;
          ctx.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
        }
        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], 'pixel-avatar.png', { type: 'image/png' });
          emit('save', file);
        }, 'image/png');
      };

      return {
        DRAW_PALETTE,
        BG_COLOR,
        cells,
        selected,
        erasing,
        hasDrawing,
        onPointerDown,
        onPointerMove,
        stopPainting,
        pickColor,
        pickEraser,
        clearAll,
        save,
        cellStyle: (c) => ({ backgroundColor: c || BG_COLOR }),
      };
    },
  };
</script>

<template>
  <div class="pixel-draw">
    <div class="pixel-palette" role="toolbar" aria-label="Drawing colours">
      <button
        v-for="color in DRAW_PALETTE"
        :key="color"
        type="button"
        class="swatch"
        :class="{ 'swatch-active': !erasing && selected === color }"
        :style="{ backgroundColor: color }"
        :aria-label="'colour ' + color"
        :aria-pressed="!erasing && selected === color"
        @click="pickColor(color)"
      />
      <button
        type="button"
        class="swatch swatch-eraser"
        :class="{ 'swatch-active': erasing }"
        aria-label="eraser"
        :aria-pressed="erasing"
        @click="pickEraser"
      >
        ⌫
      </button>
    </div>

    <div
      class="pixel-grid"
      :style="{ gridTemplateColumns: 'repeat(' + Math.sqrt(cells.length) + ', 1fr)' }"
      role="img"
      aria-label="Pixel drawing canvas"
      @pointerdown.prevent="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="stopPainting"
      @pointerleave="stopPainting"
      @pointercancel="stopPainting"
    >
      <div
        v-for="(c, i) in cells"
        :key="i"
        class="pixel-cell"
        :data-idx="i"
        :style="cellStyle(c)"
      />
    </div>

    <div class="pixel-actions">
      <button type="button" class="btn btn-ghost" :disabled="busy" @click="clearAll">Clear</button>
      <button type="button" class="btn btn-ghost" :disabled="busy" @click="$emit('cancel')">
        Cancel
      </button>
      <button type="button" class="btn" :disabled="busy || !hasDrawing" @click="save">
        Save drawing
      </button>
    </div>
  </div>
</template>

<style scoped>
  .pixel-draw {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
    max-width: 320px;
  }

  .pixel-palette {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }

  .swatch {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 0;
  }

  .swatch-active {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 2px var(--brand-primary);
  }

  .swatch-eraser {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-elevated);
    color: var(--text-on-dark);
    font-size: var(--text-sm);
  }

  .pixel-grid {
    display: grid;
    width: 100%;
    aspect-ratio: 1 / 1;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background-color: #ffffff;
    /* Prevent scroll/gesture hijack while drawing (esp. touch drag). */
    touch-action: none;
    user-select: none;
  }

  .pixel-cell {
    width: 100%;
    height: 100%;
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.06);
  }

  .pixel-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .btn {
    padding: var(--space-xs) var(--space-md);
    border: none;
    border-radius: var(--radius-sm);
    background-color: var(--brand-primary);
    color: var(--text-on-dark);
    cursor: pointer;
    font-size: var(--text-sm);
    transition: background-color var(--transition-moderate);
  }

  .btn:hover:not(:disabled) {
    background-color: var(--brand-accent);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--brand-primary);
    border: 1px solid var(--border-subtle);
  }
</style>
