<template>
  <div class="easter-hunt">
    <h1>Easter Egg Hunt</h1>
    <h2 class="page-subtitle" v-if="gameState && !isLocked">
      {{ timeLeftText }}
    </h2>
    <h2 class="page-subtitle ended" v-else-if="gameState && isLocked">
      The hunt is over!
    </h2>
    <h2 class="page-subtitle" v-else>
      <em>No active game right now</em>
    </h2>

    <div v-if="gameState" class="game-layout">
      <div class="board-panel">
        <canvas
          ref="canvas"
          :width="canvasSize"
          :height="canvasSize"
          @click="handleCanvasClick"
          :class="{ locked: isLocked, clickable: canClick }"
        ></canvas>
      </div>

      <div class="side-panels">
        <!-- Cooldown status -->
        <div class="panel">
          <div v-if="!isLoggedIn" class="cooldown-status muted">
            Log in to play
          </div>
          <div v-else-if="cooldownRemaining > 0" class="cooldown-status waiting">
            Next click in <strong>{{ cooldownText }}</strong>
          </div>
          <div v-else class="cooldown-status ready">
            Ready to click!
          </div>
        </div>

        <!-- Scoreboard -->
        <div class="panel">
          <h3>Scoreboard</h3>
          <div v-if="gameState.scores.length === 0" class="empty-state">
            No eggs found yet
          </div>
          <table v-else class="score-table">
            <tbody>
              <tr
                v-for="(entry, i) in gameState.scores"
                :key="entry.user_id"
                :class="{ 'rank-1': i === 0, 'rank-2': i === 1, 'rank-3': i === 2 }"
              >
                <td class="rank-col">{{ i + 1 }}</td>
                <td class="name-col">{{ entry.username }}</td>
                <td class="score-col">{{ entry.score }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Egg progress -->
        <div class="panel" v-if="visibleEggs.length > 0">
          <h3>Eggs Found</h3>
          <div class="egg-grid">
            <div
              v-for="egg in visibleEggs"
              :key="egg.egg_id"
              class="egg-pill"
              :class="{ completed: egg.completed }"
              :style="{ '--egg-color': egg.color }"
            >
              <span class="egg-swatch" :style="{ backgroundColor: egg.color }"></span>
              {{ egg.revealed }}/{{ egg.squares }}
              <span v-if="egg.completed" class="egg-check">&#10003;</span>
            </div>
          </div>
        </div>

        <!-- Admin controls -->
        <div class="panel admin-panel" v-if="isAdmin">
          <h3>Admin</h3>
          <div class="admin-buttons">
            <button @click="resetGame" class="btn btn-danger">Reset Game</button>
            <button @click="toggleReveal" class="btn">
              {{ showReveal ? 'Hide Eggs' : 'Reveal All Eggs' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="toast" v-if="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';

const BOARD_SIZE = 32;
const CELL_SIZE = 20;
const CANVAS_PX = BOARD_SIZE * CELL_SIZE;

// Overlay palette — earthy greens that complement the golden brand
const OVERLAY = {
  canopy:    '#2D5F3F',
  bush:      '#3D7A54',
  grass:     '#4A9465',
  meadow:    '#6DB380',
  trunk:     '#5C3D1E',
  flowerA:   '#D4A843',  // warm gold flowers
  flowerB:   '#C87D5A',  // terracotta flowers
};

// Revealed empty square — dark surface to match cards
const EMPTY_FILL = '#3A3A3A';
const GRID_LINE = 'rgba(255, 255, 255, 0.04)';
const GRID_LINE_OVERLAY = 'rgba(0, 0, 0, 0.10)';

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateOverlay(seed) {
  const rng = mulberry32(seed);
  const tiles = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  // Place trees (trunk + canopy pairs)
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 1; y < BOARD_SIZE; y++) {
      if (rng() < 0.06 && !tiles[x][y] && !tiles[x][y - 1]) {
        tiles[x][y] = OVERLAY.trunk;
        tiles[x][y - 1] = OVERLAY.canopy;
      }
    }
  }

  // Fill remaining cells
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (tiles[x][y]) continue;
      const r = rng();
      if (r < 0.025) tiles[x][y] = OVERLAY.flowerA;
      else if (r < 0.045) tiles[x][y] = OVERLAY.flowerB;
      else if (r < 0.22) tiles[x][y] = OVERLAY.bush;
      else if (r < 0.45) tiles[x][y] = OVERLAY.meadow;
      else tiles[x][y] = OVERLAY.grass;
    }
  }

  return tiles;
}

export default {
  name: 'EasterHuntView',
  data() {
    return {
      gameState: null,
      overlay: null,
      revealedSet: new Set(),
      revealedMap: {},
      cooldownRemaining: 0,
      cooldownTimer: null,
      pollTimer: null,
      countdownTimer: null,
      timeLeft: 0,
      toast: null,
      toastTimer: null,
      showReveal: false,
      adminEggs: null,
      canvasSize: CANVAS_PX,
      animatingTiles: new Map(),
      animationFrame: null,
      clickPending: false,
    };
  },
  computed: {
    isLoggedIn() {
      return !!localStorage.getItem('user_token');
    },
    isAdmin() {
      return localStorage.getItem('user_role') === 'Admin';
    },
    isLocked() {
      return this.gameState?.is_locked || false;
    },
    canClick() {
      return this.isLoggedIn && !this.isLocked && this.cooldownRemaining <= 0 && !this.clickPending;
    },
    cooldownText() {
      const m = Math.floor(this.cooldownRemaining / 60);
      const s = this.cooldownRemaining % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    },
    timeLeftText() {
      if (this.timeLeft <= 0) return 'Game ending...';
      const d = Math.floor(this.timeLeft / 86400);
      const h = Math.floor((this.timeLeft % 86400) / 3600);
      const m = Math.floor((this.timeLeft % 3600) / 60);
      if (d > 0) return `${d}d ${h}h remaining`;
      if (h > 0) return `${h}h ${m}m remaining`;
      return `${m}m remaining`;
    },
    visibleEggs() {
      if (!this.gameState) return [];
      return this.gameState.board.eggs || [];
    },
  },
  methods: {
    async fetchState() {
      try {
        const res = await axios.get('/api/games/easter-hunt/state');
        this.gameState = res.data.data;
        this.buildRevealedLookup();
        if (!this.overlay) {
          this.overlay = generateOverlay(this.gameState.seed);
        }
        this.updateTimeLeft();
        this.draw();
      } catch (e) {
        if (e.response?.status === 404) {
          this.gameState = null;
        }
      }
    },

    buildRevealedLookup() {
      this.revealedSet = new Set();
      this.revealedMap = {};
      for (const sq of this.gameState.board.revealed) {
        const key = `${sq.x},${sq.y}`;
        this.revealedSet.add(key);
        this.revealedMap[key] = sq;
      }
    },

    updateTimeLeft() {
      if (!this.gameState) return;
      const lockAt = new Date(this.gameState.lock_at).getTime();
      this.timeLeft = Math.max(0, Math.floor((lockAt - Date.now()) / 1000));
    },

    async fetchCooldown() {
      if (!this.isLoggedIn) return;
      try {
        const res = await axios.get('/api/games/easter-hunt/cooldown');
        const data = res.data.data;
        this.cooldownRemaining = data.on_cooldown ? data.remaining_seconds : 0;
      } catch (e) {
        // Synced on next click
      }
    },

    handleCanvasClick(e) {
      if (!this.isLoggedIn) {
        this.showToast('Log in to play', 'warn');
        return;
      }
      if (this.isLocked) {
        this.showToast('The hunt has ended!', 'warn');
        return;
      }
      if (this.cooldownRemaining > 0) {
        this.showToast(`Wait ${this.cooldownText} before clicking`, 'warn');
        return;
      }
      if (!this.gameState) return;

      const rect = this.$refs.canvas.getBoundingClientRect();
      const scale = CANVAS_PX / rect.width;
      const x = Math.floor((e.clientX - rect.left) * scale / CELL_SIZE);
      const y = Math.floor((e.clientY - rect.top) * scale / CELL_SIZE);

      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
      if (this.revealedSet.has(`${x},${y}`)) {
        this.showToast('Already revealed', 'info');
        return;
      }

      this.submitClick(x, y);
    },

    async submitClick(x, y) {
      this.clickPending = true;
      try {
        const res = await axios.post('/api/games/easter-hunt/clicks', { x, y });
        const data = res.data.data;
        this.cooldownRemaining = data.next_click_seconds;

        if (data.egg_completed) {
          this.showToast('You completed an egg! +1 point', 'success');
        } else if (data.egg_id >= 0) {
          this.showToast('Part of an egg revealed!', 'info');
        } else {
          this.showToast('Empty square', 'info');
        }

        // Start reveal animation for this tile before refreshing state
        this.animatingTiles.set(`${x},${y}`, { x, y, start: performance.now() });
        this.startAnimation();

        await this.fetchState();
      } catch (e) {
        const status = e.response?.status;
        const errData = e.response?.data?.error;
        if (status === 429) {
          this.showToast(errData?.message || 'On cooldown', 'warn');
          await this.fetchCooldown();
        } else if (status === 409) {
          this.showToast('Already revealed — refreshing', 'warn');
          await this.fetchState();
        } else if (status === 403) {
          this.showToast('The hunt has ended!', 'warn');
          await this.fetchState();
        } else {
          this.showToast('Something went wrong', 'error');
        }
      } finally {
        this.clickPending = false;
      }
    },

    draw(now) {
      const canvas = this.$refs.canvas;
      if (!canvas || !this.gameState) return;
      const ctx = canvas.getContext('2d');

      const board = this.gameState.board;
      const eggColorMap = {};
      for (const egg of board.eggs || []) {
        eggColorMap[egg.egg_id] = egg.color;
      }

      for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
          const px = x * CELL_SIZE;
          const py = y * CELL_SIZE;
          const key = `${x},${y}`;

          if (this.revealedSet.has(key)) {
            // Draw the revealed content (egg color or empty)
            const sq = this.revealedMap[key];
            if (sq && sq.egg_id >= 0 && eggColorMap[sq.egg_id]) {
              ctx.fillStyle = eggColorMap[sq.egg_id];
            } else {
              ctx.fillStyle = EMPTY_FILL;
            }
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

            ctx.strokeStyle = GRID_LINE;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

            // If this tile is animating, draw fading overlay on top
            const anim = this.animatingTiles.get(key);
            if (anim && now) {
              const elapsed = now - anim.start;
              const opacity = Math.max(0, 1 - elapsed / 300);
              if (opacity > 0) {
                ctx.globalAlpha = opacity;
                ctx.fillStyle = this.overlay ? this.overlay[x][y] : OVERLAY.grass;
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = GRID_LINE_OVERLAY;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
                ctx.globalAlpha = 1;
              } else {
                this.animatingTiles.delete(key);
              }
            }
          } else {
            ctx.fillStyle = this.overlay ? this.overlay[x][y] : OVERLAY.grass;
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

            ctx.strokeStyle = GRID_LINE_OVERLAY;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
          }
        }
      }

      // Admin reveal overlay
      if (this.showReveal && this.adminEggs) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        for (const egg of this.adminEggs) {
          ctx.strokeStyle = egg.color;
          for (const sq of egg.squares) {
            ctx.strokeRect(
              sq.x * CELL_SIZE + 1,
              sq.y * CELL_SIZE + 1,
              CELL_SIZE - 2,
              CELL_SIZE - 2
            );
          }
        }
        ctx.setLineDash([]);
      }
    },

    startAnimation() {
      if (this.animationFrame) return;
      const tick = (now) => {
        this.draw(now);
        if (this.animatingTiles.size > 0) {
          this.animationFrame = requestAnimationFrame(tick);
        } else {
          this.animationFrame = null;
        }
      };
      this.animationFrame = requestAnimationFrame(tick);
    },

    showToast(message, type = 'info') {
      clearTimeout(this.toastTimer);
      this.toast = { message, type };
      this.toastTimer = setTimeout(() => { this.toast = null; }, 3000);
    },

    async resetGame() {
      if (!confirm('Reset the game? This deletes all clicks and scores.')) return;
      try {
        await axios.post('/api/games/easter-hunt/admin/reset');
        this.overlay = null;
        this.showReveal = false;
        this.adminEggs = null;
        await this.fetchState();
        this.showToast('Game reset!', 'success');
      } catch (e) {
        this.showToast('Reset failed', 'error');
      }
    },

    async toggleReveal() {
      if (this.showReveal) {
        this.showReveal = false;
        this.draw();
        return;
      }
      try {
        const res = await axios.get('/api/games/easter-hunt/admin/reveal');
        this.adminEggs = res.data.data.eggs;
        this.showReveal = true;
        this.draw();
      } catch (e) {
        this.showToast('Reveal failed', 'error');
      }
    },

    startTimers() {
      this.pollTimer = setInterval(() => this.fetchState(), 10000);
      this.cooldownTimer = setInterval(() => {
        if (this.cooldownRemaining > 0) this.cooldownRemaining--;
      }, 1000);
      this.countdownTimer = setInterval(() => this.updateTimeLeft(), 1000);
    },
  },

  async mounted() {
    await this.fetchState();
    await this.fetchCooldown();
    this.startTimers();
  },

  beforeUnmount() {
    clearInterval(this.pollTimer);
    clearInterval(this.cooldownTimer);
    clearInterval(this.countdownTimer);
    clearTimeout(this.toastTimer);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  },

  watch: {
    gameState() {
      this.$nextTick(() => this.draw());
    },
  },
};
</script>

<style scoped>
/* ================================================
   Layout — matches GameWordWeaver / GameFlappyDuo
   ================================================ */
.easter-hunt {
  text-align: center;
  margin-top: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 var(--space-sm);
}

.easter-hunt h1 {
  font-family: var(--font-family-base);
  margin-bottom: var(--space-xs);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-lg);
}

.page-subtitle.ended {
  color: var(--feedback-error);
  font-weight: bold;
}

/* ================================================
   Game layout — board + panels centered
   ================================================ */
.game-layout {
  display: flex;
  gap: var(--space-xl);
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  max-width: 1100px;
}

.board-panel {
  flex-shrink: 0;
}

canvas {
  display: block;
  border-radius: var(--radius-md);
  border: 3px solid var(--border-card);
  box-shadow: var(--shadow-lg);
  image-rendering: pixelated;
  width: 640px;
  height: 640px;
  background: var(--surface-card);
}

canvas.clickable {
  cursor: crosshair;
}

canvas.locked {
  cursor: not-allowed;
  opacity: 0.7;
  border-color: var(--text-muted);
}

/* ================================================
   Side panels — dark cards with golden accents
   ================================================ */
.side-panels {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.panel {
  background-color: var(--surface-card);
  border: 3px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  box-shadow: var(--shadow-sm);
}

.panel h3 {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-lg);
  color: var(--text-heading-card);
  font-family: var(--font-family-base);
}

/* ================================================
   Cooldown status
   ================================================ */
.cooldown-status {
  font-size: var(--text-lg);
  font-weight: 500;
  text-align: center;
  padding: var(--space-xs) 0;
}

.cooldown-status.muted {
  color: var(--text-muted);
}

.cooldown-status.waiting {
  color: var(--brand-primary);
}

.cooldown-status.ready {
  color: var(--feedback-success);
}

/* ================================================
   Scoreboard table — matches WordWeaver highscores
   ================================================ */
.empty-state {
  color: var(--text-muted);
  font-style: italic;
  text-align: center;
  padding: var(--space-xs) 0;
}

.score-table {
  width: 100%;
  border-collapse: collapse;
}

.score-table td {
  padding: var(--space-xs) var(--space-xs);
  color: var(--text-on-dark);
  border-bottom: 1px solid var(--surface-card-inner);
  font-size: var(--text-sm);
}

.score-table tr:last-child td {
  border-bottom: none;
}

.rank-col {
  width: 2em;
  font-weight: bold;
  color: var(--brand-primary);
  text-align: center;
}

.name-col {
  text-align: left;
}

.score-col {
  text-align: right;
  color: var(--text-muted);
  white-space: nowrap;
}

.score-table tr.rank-1 td {
  background-color: rgba(255, 179, 0, 0.15);
}

.score-table tr.rank-2 td {
  background-color: rgba(192, 192, 192, 0.1);
}

.score-table tr.rank-3 td {
  background-color: rgba(205, 127, 50, 0.1);
}

/* ================================================
   Egg progress pills
   ================================================ */
.egg-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.egg-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-on-dark);
  background: var(--surface-card-inner);
  border: 2px solid var(--egg-color);
  transition: opacity var(--transition-base);
  opacity: 0.6;
}

.egg-pill.completed {
  opacity: 1;
  background: var(--egg-color);
  color: #1a1a1a;
}

.egg-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.egg-pill.completed .egg-swatch {
  display: none;
}

.egg-check {
  margin-left: 1px;
}

/* ================================================
   Admin controls
   ================================================ */
.admin-panel {
  border-color: var(--text-muted);
}

.admin-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.btn {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-on-dark);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 500;
  font-family: var(--font-family-base);
  transition:
    border-color var(--transition-base),
    filter var(--transition-base),
    transform var(--transition-base);
}

.btn:hover {
  border-color: var(--brand-primary);
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-danger {
  border-color: var(--feedback-error);
  color: var(--feedback-error);
}

.btn-danger:hover {
  border-color: var(--feedback-error);
  background: rgba(255, 55, 57, 0.15);
}

/* ================================================
   Toast notifications
   ================================================ */
.toast {
  position: fixed;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: var(--text-sm);
  z-index: 1000;
  box-shadow: var(--shadow-md);
  animation: fadeIn 0.2s ease;
}

.toast.success {
  background: var(--feedback-success);
  color: var(--text-on-dark);
}

.toast.info {
  background: var(--surface-card);
  color: var(--text-on-dark);
  border: 1px solid var(--border-card);
}

.toast.warn {
  background: var(--brand-primary);
  color: #1a1a1a;
}

.toast.error {
  background: var(--feedback-error);
  color: var(--text-on-dark);
}

/* ================================================
   Responsive — 768px breakpoint
   ================================================ */
@media (max-width: 768px) {
  .game-layout {
    flex-direction: column;
    align-items: center;
  }

  canvas {
    width: 100%;
    max-width: 640px;
    height: auto;
    aspect-ratio: 1;
  }

  .side-panels {
    width: 100%;
    max-width: 640px;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
