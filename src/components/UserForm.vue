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
      <!-- Access Role dropdown menu.
           The caption stays here rather than moving to AspSelect's `label`
           prop, and that is the DS's constraint, not a preference:
           .select__label is --text-xs with no weight where the .field__label
           the four AspInput/AspTextarea fields around it render is --text-sm at
           --font-weight-medium (DS defect #4484). Handing this one caption to
           the prop would put a fifth, smaller treatment in a form that finally
           has one. `for` is dropped because an id passed to AspSelect lands on
           its wrapper <div>, which is not a labelable element; the accessible
           name rides aria-label instead. Both halves come out when #4484 does. -->
      <div>
        <label>Access Role</label>
        <AspSelect
          v-model="localUser.access_role"
          :options="roleOptions"
          aria-label="Access Role"
        />
      </div>
      <!-- Comment input field. AspTextarea's caption matches AspInput's exactly,
           so this one CAN hand its label to the prop, and the hand-rolled
           <label> goes with the rule that used to imitate .field__label. -->
      <div>
        <AspTextarea
          v-model="localUser.comment"
          label="Comment"
          :rows="3"
          :max-rows="10"
        />
      </div>
      <!-- Save and Cancel buttons -->
      <div class="form-actions">
        <AspButton type="submit" variant="primary">Save User</AspButton>
        <AspButton type="button" variant="secondary" @click="cancel">Cancel</AspButton>
      </div>
    </form>
  </div>
</template>

<script>
  import { AspInput, AspButton, AspSelect, AspTextarea } from '@aspirant/design-system';

  import axios from 'axios';

  export default {
    components: { AspInput, AspButton, AspSelect, AspTextarea },
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
    computed: {
      // AspSelect takes `[{value,label}]` where the native took <option> markup.
      // Value and label are both role_name, as the <option> had — the API's `ID`
      // is not what this form submits.
      roleOptions() {
        return this.roles.map(role => ({ value: role.role_name, label: role.role_name }));
      },
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

  /* One hand-rolled caption is left — the Access Role select's, held here by DS
     defect #4484 (see the template). It is retuned to read as the .field__label
     the four DS fields render, which is the whole point of keeping it: left at
     its old --text-base/bold, this form would carry two label treatments, the
     mixed-contract regression #4296 forbids in its label lane rather than its
     control lane. The e2e asserts the two resolve identically, so a later tidy
     into AspSelect's `label` prop fails loudly instead of shrinking one caption. */
  .user-form label {
    display: block;
    margin-bottom: var(--space-2xs);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.3;
    color: var(--text-on-light);
  }

  /* The block that used to hand-paint `select` and `textarea` is gone. It said
     those were "primitive families #4278 does not cover" and held them to the
     box AspInput renders — a statement about that census, not about the DS:
     AspSelect and AspTextarea have shipped throughout, and each now paints the
     34px / --radius-md / --border-control / --surface-elevated box the rule was
     copying. The rule could not have survived the port in any case, since both
     components render their control past this file's data-v attribute.

     The one declaration with no DS equivalent is the full-row width. AspSelect's
     root is `display: inline-flex` and its trigger has `min-width: 10rem`, so in
     this 500px column it would sit at its content width beside four fields that
     fill the row. AspTextarea's root is already block-level. */
  .user-form .select {
    display: flex;
    width: 100%;
  }

  /* Save (confirm) and Cancel (neutral) are AspButtons now — DS owns their fill,
     ink, radius, focus and hover (#4295 button-of-record family). The old
     bespoke green/red pair is deliberately dropped: the DS variants carry the
     confirm/neutral semantics through `variant="primary"`/`"secondary"`, not
     through a hand-picked feedback colour. This container only lays them out;
     `gap` replaces the per-button `margin-left` that used to space the pair. */
  .user-form .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
</style>
