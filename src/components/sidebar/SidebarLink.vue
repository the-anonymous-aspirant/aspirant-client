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

      // Watch for changes to the image prop
      watch(
        () => props.image,
        (newImage) => {
          //console.log(`Image prop changed for ${props.to}: ${newImage ? 'has value' : 'empty'}`);
          if (newImage) {
            loadedImage.value = newImage;
          } else {
            loadDefaultImage();
          }
        }
      );

      onMounted(() => {
        //console.log(`SidebarLink mounted for ${props.to}, image prop: ${props.image ? 'has value' : 'empty'}`);
        if (props.image) {
          loadedImage.value = props.image;
        } else {
          loadDefaultImage();
        }
      });

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

  .sidebar-image {
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
