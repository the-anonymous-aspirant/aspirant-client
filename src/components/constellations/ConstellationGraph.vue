<template>
  <!--
    #4602 / #4587-F1 — the relationship graph canvas. Bespoke, token-themed SVG
    per the design-of-record (§3.100, epic #4587 c25788): positioned circular
    avatars with typed coloured edges drawn between pairs. No Asp* primitive,
    no vue-flow/dagre — the chrome around this canvas is the DS's job, the
    canvas itself is hand-built SVG.

    Layout is a ring (operator default, epic c25764): members sorted by seat
    slot, spaced equidistantly, first seat at the top. Edge colours come from
    the D1 payload verbatim (relationship_types.colour, A2 data — never
    frontend constants). All six seeded colours were measured ≥ 3:1 against
    both ends of the room's radial surface (#131a33 → #0b1020); worst pair
    5.82:1 (§3.60 validation recorded on task #4602).

    Hovering or keyboard-focusing a player reveals their name. Selection (F2,
    #4603): clicking or Enter/Space on an avatar emits `select` with the
    player's user_id; the parent owns the up-to-two selection and passes it
    back via `selectedIds`, which highlights the chosen rings.
  -->
  <svg
    class="constellation-graph"
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    role="img"
    :aria-label="`Relationship board with ${placed.length} players`"
    data-testid="board-graph"
  >
    <!-- Edge layer first so avatars paint over the line ends. -->
    <g>
      <line
        v-for="edge in edges"
        :key="edge.key"
        class="constellation-graph-edge"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        :stroke="edge.colour"
        data-testid="board-edge"
        :data-type-code="edge.typeCode"
      >
        <title>{{ edge.title }}</title>
      </line>
    </g>

    <g>
      <g
        v-for="node in placed"
        :key="node.member.user_id"
        class="constellation-graph-node"
        :class="{ 'constellation-graph-node--selected': selectedSet.has(node.member.user_id) }"
        :transform="`translate(${node.x}, ${node.y})`"
        tabindex="0"
        role="button"
        :aria-label="node.name"
        :aria-pressed="selectedSet.has(node.member.user_id)"
        data-testid="board-avatar"
        :data-user-id="node.member.user_id"
        @click="emit('select', node.member.user_id)"
        @keydown.enter.prevent="emit('select', node.member.user_id)"
        @keydown.space.prevent="emit('select', node.member.user_id)"
      >
        <circle class="constellation-graph-node-ring" :r="AVATAR_R" />
        <clipPath :id="`cg-clip-${node.member.user_id}`">
          <circle :r="AVATAR_R - 2" />
        </clipPath>
        <image
          v-if="node.member.avatar_url && !brokenAvatars.has(node.member.user_id)"
          :href="node.member.avatar_url"
          :x="-(AVATAR_R - 2)"
          :y="-(AVATAR_R - 2)"
          :width="(AVATAR_R - 2) * 2"
          :height="(AVATAR_R - 2) * 2"
          :clip-path="`url(#cg-clip-${node.member.user_id})`"
          preserveAspectRatio="xMidYMid slice"
          @error="brokenAvatars.add(node.member.user_id)"
        />
        <text v-else class="constellation-graph-node-initial" dy="0.35em">
          {{ node.initial }}
        </text>
        <text
          class="constellation-graph-node-name"
          :y="AVATAR_R + 16"
          data-testid="avatar-name"
        >
          {{ node.name }}
        </text>
      </g>
    </g>
  </svg>
</template>

<script setup>
import { computed, reactive } from 'vue';

// members / relationships are the D1 aggregate's arrays verbatim
// (RoomStateMember / RoomStateRelationship, #4600).
const props = defineProps({
  members: { type: Array, default: () => [] },
  relationships: { type: Array, default: () => [] },
  // user_ids the parent holds as the current selection (F2 edit gesture).
  selectedIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['select']);

const selectedSet = computed(() => new Set(props.selectedIds));

const SIZE = 480; // square viewBox; the room shell scales it responsively
const CENTER = SIZE / 2;
const RING_R = 168;
const AVATAR_R = 34;

const brokenAvatars = reactive(new Set());

function displayName(member) {
  return member.game_username || `Player ${member.slot}`;
}

// Ring layout: seat-slot order, equidistant, first seat at the top. A single
// player sits in the centre — a ring of one has no shape.
const placed = computed(() => {
  const sorted = [...props.members].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const n = sorted.length;
  return sorted.map((member, i) => {
    const r = n > 1 ? RING_R : 0;
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    const name = displayName(member);
    return {
      member,
      name,
      initial: (name[0] || '?').toUpperCase(),
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle),
    };
  });
});

const edges = computed(() => {
  const byId = new Map(placed.value.map((n) => [n.member.user_id, n]));
  return props.relationships
    .map((rel, i) => {
      const from = byId.get(rel.from_user_id);
      const to = byId.get(rel.to_user_id);
      if (!from || !to) return null;
      return {
        key: `${rel.from_user_id}-${rel.to_user_id}-${rel.type_id}-${i}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        colour: rel.colour,
        typeCode: rel.type_code,
        title: `${from.name} — ${to.name}: ${rel.type_label}`,
      };
    })
    .filter(Boolean);
});
</script>

<style scoped>
.constellation-graph {
  width: 100%;
  max-width: 30rem;
  height: auto;
  display: block;
}

.constellation-graph-edge {
  stroke-width: 4;
  stroke-linecap: round;
}

.constellation-graph-node {
  cursor: pointer;
  outline: none;
}

/* Selection outranks the hover highlight (the :hover rule above carries
   higher specificity, so the selected state must repeat it). */
.constellation-graph-node--selected .constellation-graph-node-ring,
.constellation-graph-node--selected:hover .constellation-graph-node-ring,
.constellation-graph-node--selected:focus-visible .constellation-graph-node-ring {
  stroke: #facc15;
  stroke-width: 3;
}

.constellation-graph-node-ring {
  fill: #131a33;
  stroke: #334155;
  stroke-width: 2;
}

.constellation-graph-node:hover .constellation-graph-node-ring,
.constellation-graph-node:focus-visible .constellation-graph-node-ring {
  stroke: #f8fafc;
}

.constellation-graph-node-initial {
  fill: #94a3b8;
  font-size: 1.5rem;
  font-weight: 600;
  text-anchor: middle;
}

/* Name is hidden until the player is hovered or keyboard-focused (F1 spec:
   hovering a player reveals their name). */
.constellation-graph-node-name {
  fill: #f8fafc;
  font-size: 0.8rem;
  text-anchor: middle;
  opacity: 0;
  transition: opacity 120ms ease-in-out;
  pointer-events: none;
}

.constellation-graph-node:hover .constellation-graph-node-name,
.constellation-graph-node:focus-visible .constellation-graph-node-name {
  opacity: 1;
}
</style>
