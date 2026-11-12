<template>
  <AspModal :open="open" title="Receipt" size="md" @update:open="onOpenChange">
    <div class="receipt-dialog" data-test="receipt-dialog">
      <p v-if="expenseLabel" class="receipt-dialog__lead">{{ expenseLabel }}</p>

      <p v-if="state === 'loading'" class="muted" data-test="receipt-loading">Loading…</p>

      <template v-else>
        <div v-if="state === 'set'" class="receipt-preview" data-test="receipt-preview">
          <img v-if="previewKind === 'image'" :src="previewUrl" alt="The attached receipt" data-test="receipt-preview-image" />
          <!-- A PDF iframe needs a blob: URL, never the API URL directly: that
               route answers Content-Disposition attachment, which makes an
               <iframe src> download instead of preview (memory slug
               pdf-attachment-iframe-preview-needs-blob-url). Headless
               Chromium has no built-in PDF viewer, so this screenshots blank
               there -- that is expected, not a bug. -->
          <iframe v-else-if="previewKind === 'pdf'" :src="previewUrl" title="The attached receipt" class="receipt-preview__pdf" data-test="receipt-preview-pdf" />
          <p v-else class="muted receipt-preview__none" data-test="receipt-preview-unavailable">Preview not available. Use Download to open it.</p>
        </div>
        <p v-else-if="state === 'none'" class="muted" data-test="receipt-none">No receipt attached.</p>

        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          class="receipt-dialog__input"
          tabindex="-1"
          aria-hidden="true"
          data-test="receipt-file-input"
          @change="onFileSelected"
        />
        <div class="receipt-dialog__actions">
          <AspButton
            variant="secondary"
            size="sm"
            type="button"
            :loading="attaching"
            data-test="receipt-attach"
            @click="$refs.fileInput.click()"
          >
            {{ state === 'set' ? 'Replace receipt' : 'Attach receipt' }}
          </AspButton>
          <AspButton
            v-if="state === 'set'"
            variant="secondary"
            size="sm"
            type="button"
            data-test="receipt-download"
            @click="download"
          >
            Download
          </AspButton>
          <AspButton
            v-if="state === 'set'"
            :variant="confirmingRemove ? 'destructive' : 'ghost'"
            size="sm"
            type="button"
            :loading="removing"
            data-test="receipt-remove"
            @click="remove"
          >
            {{ confirmingRemove ? 'Remove this receipt' : 'Remove' }}
          </AspButton>
        </div>
        <p class="receipt-dialog__hint">PDF, PNG or JPEG, up to 5 MB.</p>
        <p v-if="errorMsg" class="receipt-dialog__error" role="alert" data-test="receipt-error">{{ errorMsg }}</p>
      </template>
    </div>
    <template #footer>
      <ModalActions>
        <AspButton variant="secondary" @click="onOpenChange(false)">Close</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspModal } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import { deleteExpenseReceipt, downloadBlob, errorOf, expenseReceiptUrl, getExpenseReceiptBlob, uploadExpenseReceipt } from './api.js';

  // Only these exact types are ever previewed, and the blob is rebuilt with
  // that type (security review c65957 on #10623): a blob: document runs in
  // the app's own origin, and the server's sandbox CSP stays on the HTTP
  // response, so a 200 of any other type -- a proxy page, an SPA fallback --
  // must never become an iframe here. Anything else is Download only.
  const PREVIEW_KINDS = { 'image/png': 'image', 'image/jpeg': 'image', 'application/pdf': 'pdf' };

  // Attach, view and remove the one receipt a work expense can carry
  // (system_3 #10602/#10603), mirroring ProfileEditor's logo upload affordance
  // (same file-input + AspButton pattern), but applied at once rather than
  // staged: a receipt isn't part of the expense form, it's its own small
  // record, so Attach/Replace/Remove each call the server immediately.
  export default {
    name: 'ExpenseReceiptDialog',
    components: { AspButton, AspModal, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      expenseId: { type: Number, default: null },
      expenseLabel: { type: String, default: '' },
    },
    emits: ['update:open', 'changed'],
    data() {
      return {
        state: 'loading', // 'loading' | 'none' | 'set' | 'error'
        previewUrl: '',
        previewKind: '', // 'image' | 'pdf' | '' (no preview, Download only)
        attaching: false,
        removing: false,
        confirmingRemove: false,
        errorMsg: '',
      };
    },
    watch: {
      open(isOpen) {
        if (isOpen) this.load();
        else this.clearPreview();
      },
    },
    beforeUnmount() {
      this.clearPreview();
    },
    methods: {
      async load() {
        this.state = 'loading';
        this.errorMsg = '';
        this.confirmingRemove = false;
        this.clearPreview();
        try {
          const { blob, contentType } = await getExpenseReceiptBlob(this.expenseId);
          const type = String(contentType || '').split(';')[0].trim().toLowerCase();
          this.previewKind = PREVIEW_KINDS[type] || '';
          if (this.previewKind) this.previewUrl = URL.createObjectURL(new Blob([blob], { type }));
          this.state = 'set';
        } catch (err) {
          if (err && err.response && err.response.status === 404) {
            this.state = 'none';
          } else {
            this.state = 'error';
            this.errorMsg = errorOf(err).message;
          }
        }
      },
      clearPreview() {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = '';
        this.previewKind = '';
      },
      onOpenChange(isOpen) {
        this.$emit('update:open', isOpen);
      },
      async onFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        this.attaching = true;
        this.errorMsg = '';
        try {
          await uploadExpenseReceipt(this.expenseId, file);
          this.$emit('changed');
          await this.load();
        } catch (err) {
          this.errorMsg = errorOf(err).message;
        } finally {
          this.attaching = false;
        }
      },
      async remove() {
        if (!this.confirmingRemove) {
          this.confirmingRemove = true;
          return;
        }
        this.removing = true;
        this.errorMsg = '';
        try {
          await deleteExpenseReceipt(this.expenseId);
          this.$emit('changed');
          this.state = 'none';
          this.clearPreview();
        } catch (err) {
          this.errorMsg = errorOf(err).message;
        } finally {
          this.removing = false;
          this.confirmingRemove = false;
        }
      },
      download() {
        downloadBlob(expenseReceiptUrl(this.expenseId), 'receipt');
      },
    },
  };
</script>

<style scoped>
  .receipt-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .receipt-dialog__lead {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .muted {
    color: var(--text-muted);
    margin: 0;
  }

  .receipt-preview {
    display: flex;
    justify-content: center;
    background: var(--surface-subtle, transparent);
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-md, 6px);
    overflow: hidden;
    min-height: 120px;
  }

  .receipt-preview img {
    max-width: 100%;
    max-height: 320px;
    object-fit: contain;
  }

  .receipt-preview__none {
    align-self: center;
    padding: var(--space-md);
  }

  .receipt-preview__pdf {
    width: 100%;
    height: 320px;
    border: none;
  }

  .receipt-dialog__input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
  }

  .receipt-dialog__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .receipt-dialog__hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .receipt-dialog__error {
    margin: 0;
    color: var(--feedback-error);
  }
</style>
