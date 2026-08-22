<script>
  import { computed } from 'vue';

  // UserAvatar renders a user's identity as their profile picture when one is
  // set, and falls back to an initials placeholder otherwise (#4170). It is the
  // single component every surface uses to render "who this is", so avatar vs
  // placeholder is decided in exactly one place — no mixed state where some
  // surfaces show the picture and others show initials.
  export default {
    name: 'UserAvatar',
    props: {
      // Browser-facing avatar URL from the backend (avatar_url on the profile /
      // public-user DTOs). Empty string ⇒ no picture ⇒ initials fallback.
      avatarUrl: { type: String, default: '' },
      // Display name / username used for the initials fallback and img alt.
      name: { type: String, default: '' },
      // Rendered square size; a number is treated as px.
      size: { type: [Number, String], default: 40 },
    },
    setup(props) {
      const initials = computed(() => {
        const n = (props.name || '').trim();
        if (!n) return '?';
        const parts = n.split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
      });
      const dimension = computed(() =>
        typeof props.size === 'number' ? `${props.size}px` : props.size
      );
      const fontSize = computed(() => {
        const px = typeof props.size === 'number' ? props.size : parseInt(props.size, 10) || 40;
        return `${Math.max(10, Math.round(px * 0.42))}px`;
      });
      return { initials, dimension, fontSize };
    },
  };
</script>

<template>
  <span class="user-avatar" :style="{ width: dimension, height: dimension }">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name || 'avatar'" class="user-avatar-img" />
    <span v-else class="user-avatar-initials" :style="{ fontSize }">{{ initials }}</span>
  </span>
</template>

<style scoped>
  .user-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    background: var(--brand-primary);
    color: var(--text-on-dark);
    font-weight: 600;
    flex-shrink: 0;
    line-height: 1;
    vertical-align: middle;
  }

  .user-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .user-avatar-initials {
    text-transform: uppercase;
    user-select: none;
  }
</style>
