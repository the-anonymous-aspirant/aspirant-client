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

    <!-- Tabs -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'rules' }"
        @click="activeTab = 'rules'"
      >Rules</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'game' }"
        @click="activeTab = 'game'"
      >Game</button>
    </div>

    <!-- Rules tab -->
    <div v-if="activeTab === 'rules'" class="rules-content">
      <div class="panel rules-panel">
        <h3>How to Play</h3>
        <ul class="rules-list">
          <li>Somewhere on the board, <strong>24 colourful eggs</strong> are hiding under the dark squares. Click anywhere on the board to reveal a <strong>5&times;5 area</strong>.</li>
          <li>You have a limited number of clicks that <strong>refill over time</strong> &mdash; spend them wisely!</li>
          <li>When every cell of an egg is uncovered, you <strong>score a point</strong>. The player who reveals the final cell claims it.</li>
          <li>This is a <strong>shared board</strong> &mdash; everyone sees the same grid. Coordinate or compete!</li>
          <li>The hunt ends when the timer runs out. At the end, every competitor gets to <strong>pick presents from a basket</strong>, in the order of how many eggs they collected.</li>
        </ul>
        <h3>Competitors</h3>
        <p class="competitors">aspirant_admin, alex, jenny, maria, robert, vinoly</p>
        <p class="encouragement">Ready alex, jenny, maria, robert, vinoly? Let's go!</p>
      </div>
    </div>

    <!-- Game tab -->
    <div v-if="activeTab === 'game' && gameState" class="game-layout">
      <!-- Left panel: Eggs + Cooldown -->
      <div class="side-panel left-panel">
        <div class="panel">
          <h3>Eggs</h3>
          <div class="egg-grid">
            <div
              v-for="egg in visibleEggs"
              :key="egg.egg_id"
              class="egg-pill"
              :class="{ completed: egg.completed }"
              :style="{ '--egg-color': egg.color }"
            >
              <span class="egg-swatch" :style="{ backgroundColor: egg.color }"></span>
              {{ Math.round(egg.revealed / egg.squares * 100) }}%
              <span v-if="egg.completed" class="egg-check">&#10003;</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div v-if="!isLoggedIn" class="cooldown-status muted">
            Log in to play
          </div>
          <div v-else-if="isAdmin" class="cooldown-status ready">
            Admin: unlimited clicks
          </div>
          <div v-else-if="clicksRemaining > 0" class="cooldown-status ready">
            <strong>{{ clicksRemaining }}</strong> click{{ clicksRemaining === 1 ? '' : 's' }} remaining
            <div class="refill-hint">+1 in {{ refillText }}</div>
          </div>
          <div v-else class="cooldown-status waiting">
            No clicks left
            <div class="refill-hint">+1 in {{ refillText }}</div>
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

      <!-- Center: Board -->
      <div class="board-panel">
        <canvas
          ref="canvas"
          :width="canvasSize"
          :height="canvasSize"
          @click="handleCanvasClick"
          :class="{ locked: isLocked, clickable: canClick }"
        ></canvas>
      </div>

      <!-- Right panel: Scoreboard -->
      <div class="side-panel right-panel">
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
      </div>
    </div>

    <div class="toast" v-if="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';

const BOARD_SIZE = 128;
const CELL_SIZE = 10;
const CANVAS_PX = BOARD_SIZE * CELL_SIZE;

// Overlay palette — dark grays with subtle variation for texture
const OVERLAY = {
  canopy:    '#2a2a2a',
  bush:      '#333333',
  grass:     '#3d3d3d',
  meadow:    '#474747',
  trunk:     '#242424',
  flowerA:   '#3a3a3a',
  flowerB:   '#404040',
};

// Revealed empty square — transparent (shows page background)
const EMPTY_FILL = null;
const GRID_LINE = 'rgba(255, 255, 255, 0.04)';
const GRID_LINE_OVERLAY = 'rgba(0, 0, 0, 0.10)';

// Player color palette — 12 distinct hues for overlay tinting
const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
];

function playerColor(userId) {
  return PLAYER_COLORS[userId % PLAYER_COLORS.length];
}

// ── Web Audio API sound effects ──────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playMissSound() {
  const ctx = getAudioCtx();
  // Sad descending minor third: E4 → C4
  const notes = [329.63, 261.63];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const t = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}

function playEggClickSound() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

function playEggCompleteSound() {
  const ctx = getAudioCtx();
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const t = ctx.currentTime + i * 0.09;
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

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
      if (rng() < 0.015 && !tiles[x][y] && !tiles[x][y - 1]) {
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
      clicksRemaining: 0,
      refillSeconds: 0,
      refillTimer: null,
      pollTimer: null,
      countdownTimer: null,
      timeLeft: 0,
      activeTab: 'rules',
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
      return this.isLoggedIn && !this.isLocked && this.clicksRemaining > 0 && !this.clickPending;
    },
    refillText() {
      const m = Math.floor(this.refillSeconds / 60);
      const s = this.refillSeconds % 60;
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

    async fetchBudget() {
      if (!this.isLoggedIn) return;
      try {
        const res = await axios.get('/api/games/easter-hunt/cooldown');
        const data = res.data.data;
        this.clicksRemaining = data.clicks_remaining;
        this.refillSeconds = data.next_refill_seconds || 0;
        if (this.clicksRemaining > 0) {
          this.computeRefillCountdown(data.next_refill_at);
        }
      } catch (e) {
        // Synced on next click
      }
    },

    computeRefillCountdown(nextRefillAt) {
      const refillTime = new Date(nextRefillAt).getTime();
      this.refillSeconds = Math.max(0, Math.floor((refillTime - Date.now()) / 1000));
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
      if (this.clicksRemaining <= 0) {
        this.showToast(`No clicks left — next in ${this.refillText}`, 'warn');
        return;
      }
      if (!this.gameState) return;
      if (this.clickPending) return;

      const rect = this.$refs.canvas.getBoundingClientRect();
      const scale = CANVAS_PX / rect.width;
      const x = Math.floor((e.clientX - rect.left) * scale / CELL_SIZE);
      const y = Math.floor((e.clientY - rect.top) * scale / CELL_SIZE);

      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;

      this.submitClick(x, y);
    },

    async submitClick(x, y) {
      this.clickPending = true;
      try {
        const res = await axios.post('/api/games/easter-hunt/clicks', { x, y });
        const data = res.data.data;
        this.clicksRemaining = data.clicks_remaining;
        if (data.next_refill_at) {
          this.computeRefillCountdown(data.next_refill_at);
        }

        const completed = data.eggs_completed_count || 0;
        const hasEggCells = (data.revealed || []).some(c => c.egg_id >= 0);

        if (completed > 0) {
          playEggCompleteSound();
          const msg = completed === 1 ? 'Egg completed! +1 point' : `${completed} eggs completed! +${completed} points`;
          this.showToast(msg, 'success');
        } else if (hasEggCells) {
          playEggClickSound();
          this.showToast(`${data.revealed_count} squares revealed`, 'info');
        } else {
          playMissSound();
          this.showToast(`${data.revealed_count} squares revealed`, 'info');
        }

        // Animate all newly revealed tiles
        const now = performance.now();
        for (const cell of data.revealed || []) {
          this.animatingTiles.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y, start: now });
        }
        this.startAnimation();

        await this.fetchState();
      } catch (e) {
        const status = e.response?.status;
        const errData = e.response?.data?.error;
        if (status === 429) {
          this.showToast(errData?.message || 'No clicks remaining', 'warn');
          await this.fetchBudget();
        } else if (status === 409) {
          this.showToast('Area already revealed — refreshing', 'warn');
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
            const sq = this.revealedMap[key];
            const isEgg = sq && sq.egg_id >= 0 && eggColorMap[sq.egg_id];
            ctx.fillStyle = isEgg ? eggColorMap[sq.egg_id] : '#e4e4e4';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            if (isEgg) {
              ctx.fillStyle = '#e67e22';
              ctx.fillRect(px, py, CELL_SIZE, 1);
              ctx.fillRect(px, py + CELL_SIZE - 1, CELL_SIZE, 1);
              ctx.fillRect(px, py, 1, CELL_SIZE);
              ctx.fillRect(px + CELL_SIZE - 1, py, 1, CELL_SIZE);
            }

            // Fade-out animation for newly revealed tiles
            const anim = this.animatingTiles.get(key);
            if (anim && now) {
              const opacity = Math.max(0, 1 - (now - anim.start) / 300);
              if (opacity > 0) {
                ctx.globalAlpha = opacity;
                ctx.fillStyle = this.overlay ? this.overlay[x][y] : OVERLAY.grass;
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.globalAlpha = 1;
              } else {
                this.animatingTiles.delete(key);
              }
            }
          } else {
            ctx.fillStyle = this.overlay ? this.overlay[x][y] : OVERLAY.grass;
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          }
        }
      }

      // Player color overlay — thin tint showing who revealed each cell
      ctx.globalAlpha = 0.18;
      for (const sq of board.revealed) {
        if (sq.user_id) {
          ctx.fillStyle = playerColor(sq.user_id);
          const px = sq.x * CELL_SIZE;
          const py = sq.y * CELL_SIZE;
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        }
      }
      ctx.globalAlpha = 1;

      // Admin reveal overlay — outline each egg's cells
      if (this.showReveal && this.adminEggs) {
        ctx.lineWidth = 1;
        for (const egg of this.adminEggs) {
          ctx.fillStyle = egg.color;
          ctx.globalAlpha = 0.45;
          for (const sq of egg.squares) {
            ctx.fillRect(sq.x * CELL_SIZE, sq.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          }
          ctx.globalAlpha = 1;
        }
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
      this.refillTimer = setInterval(() => {
        if (this.refillSeconds > 0) {
          this.refillSeconds--;
          if (this.refillSeconds <= 0 && this.clicksRemaining <= 0) {
            this.fetchBudget();
          }
        }
      }, 1000);
      this.countdownTimer = setInterval(() => this.updateTimeLeft(), 1000);
    },
  },

  async mounted() {
    await this.fetchState();
    await this.fetchBudget();
    this.startTimers();
  },

  beforeUnmount() {
    clearInterval(this.pollTimer);
    clearInterval(this.refillTimer);
    clearInterval(this.countdownTimer);
    clearTimeout(this.toastTimer);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  },

  watch: {
    gameState() {
      this.$nextTick(() => this.draw());
    },
    activeTab(val) {
      if (val === 'game') {
        this.$nextTick(() => this.draw());
      }
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
   Tabs
   ================================================ */
.tab-bar {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-lg);
}

.tab-btn {
  padding: var(--space-xs) var(--space-lg);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: var(--font-family-base);
  cursor: pointer;
  transition:
    background-color var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
}

.tab-btn:hover {
  border-color: var(--brand-primary);
  color: var(--text-on-dark);
}

.tab-btn.active {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #1a1a1a;
}

/* ================================================
   Rules content
   ================================================ */
.rules-content {
  max-width: 640px;
  width: 100%;
}

.rules-panel {
  text-align: left;
}

.rules-list {
  margin: 0 0 var(--space-md);
  padding-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.rules-list li {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.competitors {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  margin: var(--space-xs) 0 var(--space-md);
}

.encouragement {
  color: var(--brand-primary);
  font-weight: 600;
  font-size: var(--text-md);
  margin: 0;
}

/* ================================================
   Game layout — three columns: eggs | board | scoreboard
   ================================================ */
.game-layout {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: var(--space-md);
  width: 100%;
}

.board-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 240px;
  flex-shrink: 0;
}

canvas {
  display: block;
  border-radius: var(--radius-md);
  border: 3px solid var(--border-card);
  box-shadow: var(--shadow-lg);
  image-rendering: pixelated;
  width: min(1280px, calc(100vh - 160px));
  height: min(1280px, calc(100vh - 160px));
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

.refill-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: normal;
  margin-top: 2px;
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
   Responsive — stack on narrow screens
   ================================================ */
@media (max-width: 1024px) {
  .game-layout {
    flex-direction: column;
    align-items: center;
  }

  .side-panel {
    width: 100%;
    flex-shrink: 1;
  }

  .left-panel {
    order: 2;
  }

  .board-panel {
    order: 1;
  }

  .right-panel {
    order: 3;
  }

  canvas {
    width: 100%;
    max-width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
