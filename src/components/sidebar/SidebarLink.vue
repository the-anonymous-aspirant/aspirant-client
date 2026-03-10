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
    <template v-if="loadedImage">
      <img :src="loadedImage" alt="Sidebar Image" class="sidebar-image" />
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
    <span v-else id="sidebar-link" class="empty-slot"></span>
  </router-link>
</template>

<style>
  .active {
    color: var(--text-on-dark);
    font-size: 1.4rem;
    transition: 0.1s linear;
  }

  .active:hover {
    color: var(--text-on-dark);
    font-size: 1.4rem;
    transition: 0.1s linear;
  }

  .inactive {
    color: var(--brand-primary);
    font-size: 1.1rem;
    transition: 0.1s linear;
  }

  .inactive:hover {
    color: var(--text-on-dark);
    transition: 0.2s linear;
  }

  #sidebar-link {
    display: flex;
    flex-direction: column;
  }

  .empty-slot {
    display: inline-block;
    height: 20px; /* Reduced from 50px to make collapsed sidebar more compact */
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
