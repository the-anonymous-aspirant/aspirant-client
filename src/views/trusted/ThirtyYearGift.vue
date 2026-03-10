<template>
  <div class="gift-page">
    <h1>Den Stökiga Väggen</h1>
    <p class="subtitle">Om bara någon kunde bringa ordning i kaoset...</p>

    <div
      class="puzzle-grid"
      :class="{ solved: isSolved }"
    >
      <div
        v-for="(tile, index) in tiles"
        :key="tile.id"
        class="puzzle-tile"
        :class="{
          dragging: dragIndex === index,
          'drop-target': dropTarget === index && dropTarget !== dragIndex,
        }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index)"
        @dragleave="onDragLeave(index)"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
        @touchstart="onTouchStart(index, $event)"
        @touchmove="onTouchMove($event)"
        @touchend="onTouchEnd($event)"
      >
        <img :src="tile.image" :alt="'Piece ' + tile.label" class="tile-image" />
      </div>
    </div>

    <transition name="popup">
      <div v-if="isSolved" class="popup-backdrop" :style="{ paddingLeft: sidebarWidth }" @click.self="isSolved = false">
        <div class="popup-content">
          <img :src="qrImageUrl" alt="QR Code" class="qr-image" />
        </div>
      </div>
    </transition>

  </div>
</template>

<script>
import AssetManager from '../../asset_manager';
import { sidebarWidth } from '../../global_state_manager.js';

function shuffleIndices() {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  } while (arr.every((v, i) => v === i));
  return arr;
}

export default {
  name: 'ThirtyYearGift',
  data() {
    return {
      tiles: [],
      dragIndex: null,
      dropTarget: null,
      touchDragIndex: null,
      isSolved: false,
      swapSoundUrl: '',
      fanfareUrl: '',
      qrImageUrl: '',
      sidebarWidth,
    };
  },
  methods: {
    // Desktop drag
    onDragStart(index, event) {
      this.dragIndex = index;
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver(index) {
      this.dropTarget = index;
    },
    onDragLeave(index) {
      if (this.dropTarget === index) {
        this.dropTarget = null;
      }
    },
    onDrop(index) {
      if (this.dragIndex !== null && this.dragIndex !== index) {
        this.swapTiles(this.dragIndex, index);
      }
      this.dropTarget = null;
    },
    onDragEnd() {
      this.dragIndex = null;
      this.dropTarget = null;
    },

    // Touch drag
    onTouchStart(index, event) {
      this.touchDragIndex = index;
      this.dragIndex = index;
      event.target.closest('.puzzle-tile').classList.add('touch-active');
    },
    onTouchMove(event) {
      event.preventDefault();
      const touch = event.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const tile = el && el.closest('.puzzle-tile');
      if (tile) {
        const allTiles = Array.from(this.$el.querySelectorAll('.puzzle-tile'));
        const idx = allTiles.indexOf(tile);
        if (idx !== -1) {
          this.dropTarget = idx;
        }
      } else {
        this.dropTarget = null;
      }
    },
    onTouchEnd(event) {
      const activeTile = this.$el.querySelector('.touch-active');
      if (activeTile) activeTile.classList.remove('touch-active');

      if (this.touchDragIndex !== null && this.dropTarget !== null && this.touchDragIndex !== this.dropTarget) {
        this.swapTiles(this.touchDragIndex, this.dropTarget);
      }
      this.touchDragIndex = null;
      this.dragIndex = null;
      this.dropTarget = null;
    },

    swapTiles(a, b) {
      const copy = [...this.tiles];
      [copy[a], copy[b]] = [copy[b], copy[a]];
      this.tiles = copy;
      this.playSwapSound();
      this.checkSolved();
    },

    playSwapSound() {
      if (!this.swapSoundUrl) return;
      const audio = new Audio(this.swapSoundUrl);
      audio.play().catch(() => {});
    },

    checkSolved() {
      if (this.tiles.every((tile, i) => tile.id === i)) {
        this.isSolved = true;
        if (this.fanfareUrl) {
          new Audio(this.fanfareUrl).play().catch(() => {});
        }
      }
    },
  },
  async mounted() {
    try {
      const order = shuffleIndices();
      const tilePromises = order.map((id) =>
        AssetManager.getAsset(`gift-tile-${id + 1}`).then((url) => ({
          id,
          label: id + 1,
          image: url,
        }))
      );
      this.tiles = await Promise.all(tilePromises);
      this.qrImageUrl = await AssetManager.getAsset('qr-30-year-gift');
      this.swapSoundUrl = await AssetManager.getAsset('ludde-sound');
      this.fanfareUrl = await AssetManager.getAsset('birthday-fanfare');
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  },
};
</script>

<style scoped>
.gift-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-xl) var(--space-md);
  color: var(--text-on-light);
  min-height: 100vh;
}

.subtitle {
  color: var(--text-on-dark);
  margin-bottom: var(--space-xl);
  font-size: var(--text-lg);
}

.puzzle-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
  width: 100%;
  max-width: 660px;
  transition: transform 0.4s ease, box-shadow 0.4s ease;
}

.puzzle-grid.solved {
  animation: celebrate 0.6s ease;
}

.puzzle-tile {
  aspect-ratio: 214 / 139;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: grab;
  user-select: none;
  transition: transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
  box-shadow: var(--shadow-sm);
  border: 8px solid black;
}

.puzzle-tile:active {
  cursor: grabbing;
}

.puzzle-tile.dragging {
  opacity: 0.5;
  transform: scale(0.95);
}

.puzzle-tile.drop-target {
  transform: scale(1.08);
  box-shadow: var(--shadow-lg);
  border-color: white;
}

.puzzle-tile.touch-active {
  transform: scale(0.95);
  opacity: 0.7;
}

.tile-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.popup-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.popup-content {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-2xl);
  text-align: center;
  box-shadow: var(--shadow-lg);
}

.success-text {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--brand-accent);
  margin-bottom: var(--space-xl);
}

.qr-image {
  width: 200px;
  height: 200px;
  border-radius: var(--radius-lg);
  margin: 0 auto;
  display: block;
}

/* Transitions */
.popup-enter-active {
  transition: opacity 4s ease;
}
.popup-enter-active .popup-content {
  transition: transform 4s ease;
}
.popup-enter-from {
  opacity: 0;
}
.popup-enter-from .popup-content {
  transform: scale(0.9);
}

/* Celebration animation */
@keyframes celebrate {
  0% { transform: scale(1); }
  30% { transform: scale(1.05); }
  60% { transform: scale(0.98); }
  100% { transform: scale(1); }
}

/* Mobile */
@media (max-width: 767px) {
  .puzzle-grid {
    max-width: 100%;
    gap: 4px;
  }

  .popup-content {
    padding: var(--space-xl);
    margin: var(--space-md);
  }

  .qr-image {
    width: 160px;
    height: 160px;
  }
}
</style>
