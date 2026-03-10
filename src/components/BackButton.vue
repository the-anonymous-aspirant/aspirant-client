<template>
  <div 
    v-if="showBackButton" 
    class="back-button-container"
    :class="{ 'mobile': isMobile }"
  >
    <button 
      @click="goBack" 
      class="back-button"
      :title="getBackButtonTitle()"
    >
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        class="back-icon"
      >
        <path 
          d="M15 18L9 12L15 6" 
          stroke="currentColor" 
          stroke-width="2" 
          stroke-linecap="round" 
          stroke-linejoin="round"
        />
      </svg>
      <span class="back-text" v-if="!isMobile"></span>
    </button>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { isMobile } from '@/global_state_manager.js';

export default {
  name: 'BackButton',
  setup() {
    const router = useRouter();
    const route = useRoute();

    const showBackButton = computed(() => {
      // Don't show on home page
      return route.path !== '/';
    });

    const goBack = () => {
      // Check if there's history to go back to
      if (window.history.length > 1) {
        router.go(-1);
      } else {
        // If no history, go to home page
        router.push('/');
      }
    };

    const getBackButtonTitle = () => {
      return window.history.length > 1 ? 'Go back' : 'Go to home';
    };

    return {
      showBackButton,
      goBack,
      getBackButtonTitle,
      isMobile
    };
  }
};
</script>

<style scoped>
.back-button-container {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  z-index: 1000;
  transition: all var(--transition-moderate);
}

.back-button-container.mobile {
  top: var(--space-md);
  right: var(--space-md);
}

.back-button {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--surface-card);
  color: var(--brand-primary);
  border: 2px solid var(--brand-primary);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
  font-size: var(--text-sm);
  transition: all var(--transition-moderate);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.back-button:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.back-button:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

.back-icon {
  transition: transform var(--transition-base);
}

.back-button:hover .back-icon {
  transform: translateX(-2px);
}

.back-text {
  font-family: var(--font-family-base);
  letter-spacing: 0.5px;
}

/* Mobile styles */
@media (max-width: 768px) {
  .back-button {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--text-sm);
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }

  .back-text {
    display: none;
  }

  .back-icon {
    width: 18px;
    height: 18px;
  }
}

/* Small screen adjustments */
@media (max-width: 480px) {
  .back-button-container {
    top: var(--space-sm);
    right: var(--space-sm);
  }

  .back-button {
    padding: var(--space-2xs) var(--space-sm);
    min-width: 40px;
    min-height: 40px;
  }

  .back-icon {
    width: 16px;
    height: 16px;
  }
}

/* Ensure it doesn't interfere with mobile menu */
@media (max-width: 768px) {
  .back-button-container {
    z-index: 1000;
  }
}
</style>
