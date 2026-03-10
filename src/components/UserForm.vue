<template>
  <div class="user-form">
    <form @submit.prevent="handleSubmit">
      <!-- Username input field -->
      <div>
        <label for="username">Username:</label>
        <input type="text" v-model="localUser.username" required />
      </div>
      <!-- Email input field -->
      <div>
        <label for="email">Email:</label>
        <input type="email" v-model="localUser.email" required />
      </div>
      <!-- Password input field -->
      <div>
        <label for="password">Password:</label>
        <input type="password" v-model="localUser.password" />
      </div>
      <!-- Access Role dropdown menu -->
      <div>
        <label for="accessRole">Access Role:</label>
        <select v-model="localUser.access_role">
          <option v-for="role in roles" :key="role.ID" :value="role.role_name">
            {{ role.role_name }}
          </option>
        </select>
      </div>
      <!-- Comment input field -->
      <div>
        <label for="comment">Comment:</label>
        <textarea v-model="localUser.comment"></textarea>
      </div>
      <!-- Save and Cancel buttons -->
      <div class="form-actions">
        <button type="submit" class="btn btn-save">Save User</button>
        <button type="button" class="btn btn-cancel" @click="cancel">Cancel</button>
      </div>
    </form>
  </div>
</template>

<script>
  import axios from 'axios';

  export default {
    props: {
      user: Object, // The 'user' prop is declared here, indicating that the parent component can pass a user object to this component
    },
    data() {
      return {
        // Create a local copy of the user prop to work with
        localUser: { ...this.user },
        roles: [], // Add roles data property
      };
    },
    methods: {
      // Fetch roles from the API
      async fetchRoles() {
        try {
          const response = await axios.get('/api/data_models/roles');
          if (response.status === 200) {
            this.roles = response.data.data;
            console.log('Roles fetched successfully');
          } else {
            console.error('Failed to fetch roles');
          }
        } catch (error) {
          console.error('Error fetching roles:', error);
        }
      },
      // Emit the save event with the local user data
      handleSubmit() {
        console.log('Form submitted with data:', this.localUser);
        this.$emit('save', { ...this.localUser });
      },
      // Emit the cancel event
      cancel() {
        this.$emit('cancel');
      },
    },
    watch: {
      // Watch for changes in the user prop and update localUser accordingly
      user(newUser) {
        this.localUser = { ...newUser };
      },
    },
    mounted() {
      this.fetchRoles(); // Fetch roles when the component is mounted
    },
  };
</script>

<style scoped>
  .user-form {
    margin: var(--space-lg) 0;
    max-width: 500px;
    padding: var(--space-lg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background-color: var(--surface-elevated);
    box-shadow: var(--shadow-sm);
  }

  .user-form div {
    margin-bottom: var(--space-md);
  }

  .user-form label {
    display: block;
    margin-bottom: var(--space-2xs);
    font-weight: bold;
    color: var(--text-on-light);
  }

  .user-form input[type='text'],
  .user-form input[type='email'],
  .user-form input[type='password'],
  .user-form select,
  .user-form textarea {
    width: 100%;
    padding: var(--space-sm);
    box-sizing: border-box;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background-color: var(--text-on-dark);
    font-size: var(--text-base);
  }

  .user-form textarea {
    resize: vertical;
  }

  .user-form .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .user-form .btn {
    padding: var(--space-sm) var(--space-lg);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-base);
  }

  .user-form .btn-save {
    background-color: var(--feedback-success);
    color: var(--text-on-dark);
  }

  .user-form .btn-cancel {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
    margin-left: var(--space-sm);
  }

  .user-form .btn {
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .user-form .btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }
</style>
