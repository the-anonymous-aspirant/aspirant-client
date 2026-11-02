<script>
  import { computed, ref, watch, onMounted } from 'vue';
  import { useRoute } from 'vue-router';
  import { collapsed } from '../../global_state_manager.js';
  import { isMobile, sidebarHidden } from '../../global_state_manager.js';
  import asset_manager from '../../asset_manager.js';

  export default {
    props: {
      to: {
        type: String,
        required: true,
      },
      image: {
        type: String,
        required: false,
      },
      clickAction: {
        type: Boolean,
        default: false,
      },
      // True while the sidebar's asset batch is still loading (#9581). An empty
      // `image` then means "not here yet", shown as the sized loading box; only
      // once the batch has resolved does an empty `image` mean "failed", and
      // only then is the shared `default` asset loaded (#9194's fallback).
      pending: {
        type: Boolean,
        default: false,
      },
    },
    setup(props, { emit }) {
      const route = useRoute();
      const isActive = computed(() => route.path === props.to);
      const loadedImage = ref('');
      const isLoading = ref(false);

      const loadDefaultImage = async () => {
        isLoading.value = true;
        try {
          console.log(`Loading default image for route: ${props.to}`);
          const defaultUrl = await asset_manager.getAsset('default');
          console.log(`Default image loaded: ${defaultUrl.substring(0, 30)}...`);
          loadedImage.value = defaultUrl;
        } catch (error) {
          console.error(`Failed to load default image for route ${props.to}:`, error);
        } finally {
          isLoading.value = false;
        }
      };

      // One place decides what the icon slot shows, so a change of image or of
      // the batch's state updates it in place: the link never remounts, and its
      // label fades in once (#9581).
      const sync = () => {
        if (props.image) {
          loadedImage.value = props.image;
          isLoading.value = false;
        } else if (props.pending) {
          isLoading.value = true;
        } else if (!loadedImage.value) {
          loadDefaultImage();
        }
      };
      watch(() => [props.image, props.pending], sync);
      onMounted(sync);

      const handleClick = (event) => {
        // Close sidebar on mobile when a link is clicked
        if (isMobile.value && !sidebarHidden.value) {
          sidebarHidden.value = true;
        }
        
        if (props.clickAction) {
          event.preventDefault();
          emit('linkClicked');
        }
      };

      return { isActive, collapsed, loadedImage, isLoading, handleClick, isMobile };
    },
  };
</script>

<template>
  <router-link :to="to" :class="isActive ? 'active' : 'inactive'" @click="handleClick">
    <!-- Decorative (§3.121, #9194): the label names the link, so the icon
         adds nothing for a screen reader. -->
    <template v-if="loadedImage">
      <img :src="loadedImage" alt="" class="sidebar-image" />
    </template>
    <template v-else-if="isLoading">
      <div class="sidebar-image loading"></div>
    </template>
    <template v-else>
      <div class="sidebar-image error"></div>
    </template>
    <span v-if="!collapsed" id="sidebar-link" class="fade-in">
      <slot></slot>
    </span>
    <!-- Collapsed shows the icon only; the label stays for screen readers,
         or the link would have no name. -->
    <span v-else id="sidebar-link" class="empty-slot"
      ><span class="sidebar-link-hidden-label"><slot></slot></span
    ></span>
  </router-link>
</template>

<style>
  /* Nav items keep their own treatment: the global link underline (#9191) is
     for prose links; these are styled by the nav spec. */
  .active,
  .inactive {
    text-decoration: none;
  }

  /* One label step in every state (#9193, §3.121): only the ink and the
     rule change, so the row never resizes. Amber marks the active item
     (§1.3); the 3px inset rule is its non-colour cue (§3.21), drawn as a
     shadow so the row's box and the centred label do not move. */
  .active,
  .inactive {
    font-size: var(--text-md);
    transition: color 0.1s linear;
  }

  .active {
    color: var(--brand-primary);
    box-shadow: inset 3px 0 0 var(--brand-primary);
  }

  .inactive {
    color: var(--text-on-dark);
  }

  /* Hover lifts the ink only: no size change, and no rule (the rule is the
     active cue). */
  .inactive:hover {
    color: var(--brand-primary);
  }

  #sidebar-link {
    display: flex;
    flex-direction: column;
  }

  .empty-slot {
    display: inline-block;
    height: 20px; /* Reduced from 50px to make collapsed sidebar more compact */
  }

  .sidebar-link-hidden-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* A block, centred: the loaded <img> and the pending/error <div> then have
     the same box. Inline, the img sat in a line box 7.2px taller than itself
     (the strut below its baseline), so each row grew when its icon arrived and
     the links below it moved down (#9581). */
  .sidebar-image {
    display: block;
    margin-inline: auto;
    width: 45px;
    height: 45px;
    background-color: var(--brand-primary);
    border-radius: 20%; /* makes the edges rounded */
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); /* adds a shadow for a faded edge effect */
  }

  .sidebar-image.loading {
    background: var(--brand-primary);
    animation: pulse 1.5s infinite ease-in-out;
  }

  .sidebar-image.error {
    background: var(--feedback-error);
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.6;
    }
  }
</style>
