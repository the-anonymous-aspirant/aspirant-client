<template>
  <div class="user-form">
    <form @submit.prevent="handleSubmit">
      <!-- The three hand-rolled <label for="..."> pairs that used to caption
           these fields were already broken: none of the inputs carried an
           `id`, so `for="username"` pointed at nothing and clicking the caption
           focused no control. AspInput's `label` prop mints the id and wires
           `for` itself, so the association is correct by construction rather
           than by two strings agreeing. `autocomplete="new-password"` marks
           this as an admin creating/editing SOMEONE ELSE'S credential, which is
           what stops a password manager offering the operator's own saved
           password here. -->
      <div>
        <AspInput v-model="localUser.username" label="Username" required />
      </div>
      <div>
        <AspInput v-model="localUser.email" type="email" label="Email" required />
      </div>
      <div>
        <AspInput
          v-model="localUser.password"
          type="password"
          label="Password"
          autocomplete="new-password"
        />
      </div>
      <!-- Access Role dropdown menu -->
      <div>
        <label for="accessRole">Access Role</label>
        <select v-model="localUser.access_role">
          <option v-for="role in roles" :key="role.ID" :value="role.role_name">
            {{ role.role_name }}
          </option>
        </select>
      </div>
      <!-- Comment input field -->
      <div>
        <label for="comment">Comment</label>
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
  import { AspInput } from '@aspirant/design-system';

  import axios from 'axios';

  export default {
    components: { AspInput },
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
            this.roles = response.data.items || response.data.data;
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

  /* Only the <select> and the <textarea> still take a hand-rolled caption, and
     they are retuned to read as the same caption AspInput renders for the three
     migrated fields — DS `.field__label` is --text-sm at --font-weight-medium,
     where this was --text-base at `bold`. Left alone, one form would have
     carried two different label treatments, which is the mixed-contract
     regression #4296 forbids in its label lane rather than its control lane. */
  .user-form label {
    display: block;
    margin-bottom: var(--space-2xs);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.3;
    color: var(--text-on-light);
  }

  /* `select` and `textarea` are primitive families #4278 does not cover (its
     four lanes are button / input / tooltip / table), and AspSelect/AspTextarea
     adoption is therefore out of this slice's scope — but leaving them at the
     old box would put two natives at a different height, radius and fill beside
     three DS controls in one form. So they are held to the box AspInput
     renders: 34px for the single-line control (the §3.10 filter canon),
     --radius-md, --border-control (which carries the WCAG 1.4.11 3:1 non-text
     floor that decorative --border-subtle does not), and the --surface-elevated
     / --text-body pairing resolved against the control's own surface rather
     than the page's. The textarea keeps a vertical padding instead of a fixed
     height, because a multi-line box that cannot grow is not the same control. */
  .user-form select,
  .user-form textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background-color: var(--surface-elevated);
    color: var(--text-body);
    font-family: inherit;
    font-size: var(--text-sm);
  }

  .user-form select {
    height: 34px;
    padding: 0 var(--space-sm);
  }

  .user-form textarea {
    padding: var(--space-xs) var(--space-sm);
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
