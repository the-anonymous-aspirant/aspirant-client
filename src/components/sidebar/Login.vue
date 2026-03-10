<template>
  <div v-if="!loggedIn">
    <!-- Collapsed state: show only login button -->
    <transition name="login-transition" mode="out-in">
      <div v-if="collapsed" key="collapsed" class="collapsed-login">
        <button class="collapsed-login-button" @click="expandSidebar">
          Login
        </button>
      </div>
      <!-- Expanded state: show full login form -->
      <div v-else key="expanded" class="login-card">
        <form @submit.prevent="login">
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" v-model="username" id="username" required />
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" v-model="password" id="password" required />
          </div>
          <button type="submit" class="login-button">Login</button>
        </form>
        <p v-if="error" class="error-message">{{ error }}</p>
        <p v-if="success" class="success-message">{{ success }}</p>
      </div>
    </transition>
  </div>
  <div class="logout-card" v-else @click="toggleSidebar">
    <button class="login-button" @click.stop="logout">Logout</button>
  </div>
</template>

<script>
  import { toggleSidebar } from '../../global_state_manager.js';

  export default {
    props: {
      loggedIn: {
        type: Boolean,
        required: true,
      },
      collapsed: {
        type: Boolean,
        default: false,
      },
    },
    data() {
      return {
        username: '',
        password: '',
        role: '',
        error: '',
        success: '',
        token: '',
      };
    },
    methods: {
      toggleSidebar() {
        toggleSidebar(); // Use the imported function
      },
      expandSidebar() {
        // Only expand if currently collapsed
        if (this.collapsed) {
          toggleSidebar();
        }
      },
      async logout() {
        this.username = '';
        this.password = '';
        this.role = '';
        this.token = '';
        this.error = '';
        this.success = '';

        localStorage.removeItem('user_name');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_token');
        this.$emit('logout');
      },
      async login() {
        try {
          const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: this.username,
              password: this.password,
            }),
          });

          if (!response.ok) {
            throw new Error('Invalid username or password');
          }

          const data = await response.json();
          console.log('Login successful', data);
          this.success = 'Login successful!';
          this.error = '';
          this.role = data.data.role;
          this.token = data.data.token;
          this.username = data.data.username;

          localStorage.setItem('user_name', this.username);
          localStorage.setItem('user_role', this.role);
          localStorage.setItem('user_token', this.token);
          this.$emit('login');
        } catch (err) {
          this.error = err.message;
          this.success = '';
        }
      },
    },
  };
</script>

<style scoped>
  .login-card {
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    max-width: 100%;
    width: 100%;
    text-align: center;
    margin: 0;
    transition: all var(--transition-moderate);
  }

  .form-group input {
    background-color: var(--text-on-dark);
  }

  .login-card h1 {
    margin-bottom: var(--space-lg);
    font-size: var(--text-lg);
    color: var(--text-on-light);
  }

  .form-group {
    margin-bottom: var(--space-xs);
    text-align: left;
  }

  .form-group label {
    display: block;
    margin-bottom: var(--space-2xs);
    color: var(--brand-primary);
    font-size: var(--text-base);
  }

  .form-group input {
    width: 100%;
    padding: var(--space-xs);
    border: 1px var(--brand-primary) solid;
    border-radius: var(--radius-sm);
    box-sizing: border-box;
    transition: border-color var(--transition-moderate);
    font-size: var(--text-base);
  }

  .form-group input:focus {
    border-color: var(--brand-primary);
    outline: none;
  }

  .login-button {
    width: 100%;
    padding: var(--space-xs);
    background-color: var(--brand-primary);
    color: var(--text-on-dark);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-base);
    transition: background-color var(--transition-moderate);
    margin-top: var(--space-2xs);
  }

  .login-button:hover {
    background-color: var(--brand-primary-hover);
  }

  .error-message {
    color: var(--feedback-error);
    margin-top: var(--space-xs);
    font-size: var(--text-sm);
  }

  .success-message {
    color: var(--feedback-success);
    margin-top: var(--space-xs);
    font-size: var(--text-sm);
  }

  .login-card,
  .logout-card {
    cursor: pointer;
  }

  .collapsed-login {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: var(--space-2xs);
    transition: all var(--transition-moderate);
  }

  .collapsed-login-button {
    background-color: var(--brand-primary);
    color: var(--text-on-dark);
    border: none;
    height: 40px;
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: bold;
    transition: all var(--transition-moderate);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .collapsed-login-button:hover {
    background-color: var(--brand-primary-hover);
    transform: scale(1.05);
  }

  /* Vue transition styles */
  .login-transition-enter-active,
  .login-transition-leave-active {
    transition: all var(--transition-moderate);
  }

  .login-transition-enter-from,
  .login-transition-leave-to {
    opacity: 0;
    transform: scale(0.9);
  }
</style>
