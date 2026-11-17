<template>
  <section class="payments-panel" data-test="payments-panel" :style="barShown && barHeight ? { paddingBottom: `${barHeight}px` } : null">
    <div class="panel-head">
      <h2 class="visually-hidden">Transactions</h2>
      <!-- The four ways in, equal (§3.143 Decision 2, system_3 #10555): a
           payment by hand, an expense by hand (moved here from the Book, so
           a movement has one place to be recorded), then the PayPal and N26
           imports (#9760, #10534). All stay secondary; Create invoice holds
           the one primary slot.
           Below 640px they fold behind one "Add or import" disclosure, so the
           first screen goes to the payments (system_3 #11019-A2, UX walk AM2;
           Design ack c69874 item 1, amending Decision 2 below 640). It opens
           by itself while the list is empty, where adding is the only next
           step. At 640px and up the wrapper is a plain div. The import-state
           region below stays outside the fold, so a result or failure is
           never folded away. -->
      <component
        :is="narrow ? 'details' : 'div'"
        class="ways-in-fold"
        :open="narrow ? foldOpen : undefined"
        data-test="ways-in-fold"
        @toggle="onFoldToggle"
        @click.capture="onFoldClick"
      >
      <summary v-if="narrow" class="fold-summary ways-in-fold__summary" data-test="ways-in-summary">Add or import</summary>
      <div class="ways-in">
        <AspButton variant="secondary" class="block-on-phone" data-test="manual-new" @click="manualOpen = true">
          Enter payment by hand
        </AspButton>
        <AspButton variant="secondary" class="block-on-phone" data-test="expense-new" @click="openExpense">
          Enter expense by hand
        </AspButton>
      <div class="upload">
        <input
          ref="fileInput"
          class="upload__input"
          type="file"
          accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="PayPal activity CSV or Excel file"
          data-test="payments-file"
          :disabled="importing || n26Parsing"
          @change="onFileChosen"
        />
        <AspButton
          variant="secondary"
          :loading="importing"
          :disabled="n26Parsing"
          class="block-on-phone"
          data-test="payments-import"
          @click="$refs.fileInput.click()"
        >
          Import PayPal file
        </AspButton>
      </div>
      <div class="upload">
        <input
          ref="n26Input"
          class="upload__input"
          type="file"
          multiple
          accept=".csv,.pdf,text/csv,application/pdf"
          aria-label="N26 CSV export or PDFs"
          data-test="n26-file-input"
          :disabled="n26Parsing || importing"
          @change="onN26Chosen"
        />
        <AspButton
          variant="secondary"
          :loading="n26Parsing"
          :disabled="importing"
          class="block-on-phone"
          data-test="n26-import"
          @click="$refs.n26Input.click()"
        >
          Import N26 files
        </AspButton>
      </div>
      </div>
      </component>
    </div>

    <div v-if="needsDateOrder" class="date-order" role="group" aria-labelledby="date-order-label" data-test="date-order">
      <p id="date-order-label">
        Every date in this PayPal {{ paypalNoun }} reads both ways (for example 07/08/2026). Which order does the file use?
      </p>
      <div class="date-order__actions">
        <AspButton variant="secondary" data-test="date-order-dmy" @click="reimport('dmy')">Day/month (07/08 = 7 August)</AspButton>
        <AspButton variant="secondary" data-test="date-order-mdy" @click="reimport('mdy')">Month/day (07/08 = 8 July)</AspButton>
      </div>
    </div>

    <p v-if="importError" class="error" role="alert" data-test="import-error">{{ importError }}</p>

    <AspCard v-if="summary" class="summary" padding="sm" data-test="import-summary">
      <p class="summary__line">
        <!-- The clause hangs on "imported" with no line break between, so the
             comma follows directly (system_3 #10040: a break here rendered
             "3 imported , 0 already imported"). -->
        PayPal {{ paypalNoun }}: read {{ summary.rows_read }} rows: <strong>{{ summary.imported }}</strong> imported<template v-if="summary.withdrawals"> (including {{ summary.withdrawals }} bank withdrawals)</template>,
        <template v-if="summary.refunds">{{ summary.refunds }} set to Refund, </template>{{ paypalPrior.already }} already imported, {{ summary.skipped }} skipped<template v-if="paypalPrior.removed"> ·&nbsp;<span data-test="paypal-summary-removed">{{ paypalPrior.removed }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-in" @click="openRemoved('in')">restore it on Transactions</button></span></template><template v-if="paypalPrior.deleted"> ·&nbsp;<span data-test="paypal-summary-deleted">{{ deletedClause(paypalPrior.deleted) }}</span></template>.<template v-if="expenseParts(paypalExpenses).length">
          {{ ' ' }}<span data-test="paypal-summary-expenses"><template v-if="!paypalExpenses.added">Expenses: </template><template v-for="(part, i) in expenseParts(paypalExpenses)" :key="part.key"><template v-if="i"> ·&nbsp;</template><span :data-test="`paypal-summary-expenses-${part.key}`"><template v-if="part.key === 'removed'">{{ part.count }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-out" @click="openRemoved('out')">restore it on Transactions</button></template><template v-else>{{ part.text }}</template></span></template>.</span></template><template v-if="paypalCopyKept">
          {{ ' ' }}<span data-test="paypal-summary-copy-kept">{{ paypalCopyKept }}</span></template><template v-if="payerCandidates.length">
          {{ ' ' }}<span data-test="payers-clause">{{ payersClause }}</span></template>
      </p>
      <!-- Its own line under the sentence, as a bordered button: at the end
           of the sentence in text style it was easy to miss (operator c70806
           on #10985; Design ack c71154 on system_3 #11507). No count on it:
           rows start unticked, so a number would promise additions the dialog
           does not make. The count is in the sentence above. -->
      <p v-if="payerCandidates.length" class="summary__actions">
        <AspButton variant="secondary" class="block-on-phone" data-test="payers-open" @click="payersOpen = true">Add payers…</AspButton>
      </p>
      <ul v-if="skippedReasons.length" class="summary__reasons">
        <li v-for="r in skippedReasons" :key="r.key">{{ r.count }} × {{ r.label }}</li>
      </ul>
    </AspCard>

    <!-- One import-state region serves both imports, so each line names its
         source, and one summary shows at a time (design_agent c60358). -->
    <AspCard v-if="n26Summary" class="summary" padding="sm" data-test="n26-summary">
      <p class="summary__line">
        N26: read {{ n26Summary.rows_read }} row{{ n26Summary.rows_read === 1 ? '' : 's' }} from
        {{ n26Summary.files }} file{{ n26Summary.files === 1 ? '' : 's' }}:
        <strong>{{ n26Summary.imported }}</strong> imported, {{ n26Summary.duplicates }} already imported,
        {{ n26Summary.skipped }} skipped<template v-if="n26Summary.paypal_transfers">, <span data-test="n26-summary-paypal">{{ n26PayPalClause }}</span></template><template v-if="n26Summary.space_transfers">, <span data-test="n26-summary-space-transfer">{{ n26SpaceTransferClause }}</span></template><template v-if="n26Summary.removed_earlier"> ·&nbsp;<span data-test="n26-summary-removed">{{ n26Summary.removed_earlier }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-in" @click="openRemoved('in')">restore it on Transactions</button></span></template><template v-if="n26Summary.deleted_earlier"> ·&nbsp;<span data-test="n26-summary-deleted">{{ deletedClause(n26Summary.deleted_earlier) }}</span></template>.<template v-if="n26Summary.failures.length">
          {{ ' ' }}<span data-test="n26-summary-failures">{{ n26FailureLine }}</span></template><template v-if="(n26Summary.unreadable || []).length">
          {{ ' ' }}<span data-test="n26-summary-unreadable">{{ n26UnreadableLine }}</span></template><template v-if="expenseParts(n26Expenses).length">
          {{ ' ' }}<span data-test="n26-summary-expenses"><template v-if="!n26Expenses.added">Expenses: </template><template v-for="(part, i) in expenseParts(n26Expenses)" :key="part.key"><template v-if="i"> ·&nbsp;</template><span :data-test="`n26-summary-expenses-${part.key}`"><template v-if="part.key === 'removed'">{{ part.count }} removed earlier: <button type="button" class="summary__link" data-test="removed-link-out" @click="openRemoved('out')">restore it on Transactions</button></template><template v-else>{{ part.text }}</template></span></template>.</span></template><template v-if="payerCandidates.length">
          {{ ' ' }}<span data-test="payers-clause">{{ payersClause }}</span></template>
      </p>
      <!-- Its own line under the sentence, as a bordered button: at the end
           of the sentence in text style it was easy to miss (operator c70806
           on #10985; Design ack c71154 on system_3 #11507). No count on it:
           rows start unticked, so a number would promise additions the dialog
           does not make. The count is in the sentence above. -->
      <p v-if="payerCandidates.length" class="summary__actions">
        <AspButton variant="secondary" class="block-on-phone" data-test="payers-open" @click="payersOpen = true">Add payers…</AspButton>
      </p>
    </AspCard>

    <!-- §3.142 Decision 1: the import-state region's third line, one shows
         at a time with the other two. -->
    <AspCard v-if="manualSummary" class="summary" padding="sm" data-test="manual-summary">
      <!-- The expense is in this list now (§3.143 Decision 3, system_3
           #10630); the line keeps the imports' own words for it. -->
      <p v-if="manualSummary.expense" class="summary__line" data-test="manual-summary-expense">
        By hand: 1 expense added to your book.
      </p>
      <p v-else class="summary__line">
        By hand: saved {{ formatMoney(manualSummary.gross_cents, manualSummary.currency) }}<template v-if="manualSummary.sender_name"> from {{ manualSummary.sender_name }}</template>.<template v-if="manualSummary.client_name">
          {{ ' ' }}<span data-test="manual-summary-client-added">Added {{ manualSummary.client_name }} to your client book.</span></template>
      </p>
    </AspCard>

    <!-- §3.142 Decision 5: the payers dialog's result, the region's fourth
         line; one shows at a time with the other three. -->
    <AspCard v-if="payersSummary" class="summary" padding="sm" data-test="payers-summary">
      <p class="summary__line">
        {{ payersSavedLine(payersSummary) }}
      </p>
    </AspCard>

    <!-- What a review started from these rows did (system_3 #11506), in the
         same region and the same words as on Invoices (#11505). It goes when
         ze ticks a row again or another result takes the region. -->
    <AspCard v-if="reviewSummary" class="summary" padding="sm" data-test="review-summary">
      <p class="summary__line" role="status">{{ reviewSummary }}</p>
    </AspCard>

    <!-- §3.145 Decision 2: an import says where its rows went, so a back-fill
         into an old month is not hunted for. -->
    <p v-if="landedIn && (summary || n26Summary)" class="summary__where muted" data-test="summary-landed">
      The new rows are in {{ landedIn }}.
    </p>

    <!-- §3.143 Decision 6: the removed rows open in place of the list, with
         "Back to transactions" (system_3 #10633). -->
    <RemovedRows
      v-if="removedOpen"
      :payments="removedPayments"
      :expenses="removedExpenses"
      :direction="removedDirection"
      @back="removedOpen = false"
      @changed="changed"
    />
    <template v-else>
    <!-- Nothing to filter or select before the first movement of money. -->
    <div v-if="rows.length" class="toolbar">
      <!-- §3.143 Decision 3: the direction, then a category select whose
           options follow it. -->
      <div class="filters">
        <AspSegmented
          v-model="direction"
          :options="directionOptions"
          aria-label="Show money in, out or both"
          class="direction"
          data-test="direction-filter"
        />
        <div class="filter full-select">
          <AspSelect
            v-model="categoryFilter"
            :searchable="direction !== 'in'"
            :options="filterOptions"
            aria-label="Show transactions of category"
            data-test="category-filter"
          />
        </div>
      </div>
      <!-- One selection feeds every action, each enabled by its own
           condition (§3.143 Decision 4, §3.129): Set category for rows of
           one direction, Remove for any selected row, Create invoice and
           Generate invoices for Paid work only. Generate invoices is the
           panel's one primary, rightmost, and Create invoice is secondary
           beside it (§3.159 Decision 4, system_3 #11506; operator c70831 on
           #10985: "a button next to the current invoice button … our accent
           color, as this will be the one that is used the most"). -->
      <!-- Below 640px the group is not in the toolbar: it is a bar pinned to
           the bottom of the screen, there only while a row is ticked, so the
           list never moves under the finger that ticked (§3.157 Decision 2,
           system_3 #11371). It is teleported to <body> because the toolbar is
           a size container, and a contained ancestor would pin a fixed child
           to itself, not to the screen. From 640px it renders here, as before. -->
      <Teleport to="body" :disabled="!narrow">
      <component
        :is="narrow ? 'AspCard' : 'div'"
        v-if="!narrow || selected.length"
        ref="selectionBar"
        v-bind="narrow ? { padding: 'sm', class: 'selection-bar', 'data-test': 'selection-bar', role: 'region', 'aria-label': 'Actions for the ticked rows' } : { class: 'create' }"
      >
        <!-- §3.129 Decision 5's failure line leads the bar: the rows that
             failed stay ticked, so the bar and the line stay together. -->
        <template v-if="narrow">
          <p v-if="bulkError" class="error selection-bar__error" role="alert" data-test="bulk-error">{{ bulkError }}</p>
          <p v-if="createError" class="error selection-bar__error" role="alert" data-test="create-error">{{ createError }}</p>
          <p v-if="generateError" class="error selection-bar__error" role="alert" data-test="generate-error">{{ generateError }}</p>
        </template>
        <div class="create__actions">
          <!-- In the phone's bar an armed Remove takes the first row alone
               until it is confirmed or disarmed: beside it Set category's
               count would be cut, and the count is what makes its one-tap
               write safe (ruling c71227 on system_3 #11019). -->
          <div v-if="!(narrow && confirmingRemove)" class="set-category full-select">
            <AspSelect
              :model-value="null"
              :searchable="selectedExpenses.length > 0"
              :options="setCategoryOptions"
              :placeholder="setCategoryPlaceholder"
              :aria-label="setCategoryName"
              :disabled="!canSetCategory || bulkSaving || removing"
              :aria-describedby="mixedSelection ? 'set-category-hint' : undefined"
              data-test="bulk-category"
              @update:model-value="setCategory"
            />
          </div>
          <!-- Arms first, like the row delete: "Remove (N)" becomes
               "Remove N rows", and only that second press removes. -->
          <AspButton
            :variant="confirmingRemove ? 'destructive' : 'secondary'"
            :disabled="selected.length === 0 || bulkSaving || creating"
            :loading="removing"
            :aria-describedby="confirmingRemove && removeConsequence ? 'bulk-remove-hint' : undefined"
            class="block-on-phone bar-remove"
            data-test="bulk-remove"
            @click="removeSelected"
          >
            {{ removeLabel }}
          </AspButton>
          <!-- The phone's bar says the pair as one sentence, because the
               desktop labels cannot fit half a row on any phone: "Invoice
               the 4 selected:" then "As 1 invoice" and "As 4 invoices". With
               one row ticked both would make the same single invoice, so
               only the primary shows (ruling c71227 on system_3 #11019). -->
          <p v-if="barPair" id="bar-pair-lead" class="bar-lead muted" data-test="bar-pair-lead">Invoice the {{ selected.length }} selected:</p>
          <AspButton
            v-if="!narrow || barPair"
            variant="secondary"
            :disabled="!canCreate || removing || generating"
            :loading="creating"
            :aria-describedby="createCaption ? 'create-invoice-hint' : undefined"
            :aria-label="barPair ? `Create one invoice from the ${selected.length} selected payments` : undefined"
            class="block-on-phone bar-pair"
            data-test="create-invoice"
            @click="createInvoice"
          >
            <template v-if="barPair">As 1 invoice</template>
            <template v-else>Create invoice{{ selected.length && !selectedExpenses.length ? ` from ${selected.length} payment${selected.length === 1 ? '' : 's'}` : '' }}</template>
          </AspButton>
          <!-- One draft per ticked payment, then the one-at-a-time review
               (system_3 #11505). Nothing is issued by this press. -->
          <AspButton
            :disabled="!generatable || removing || creating"
            :loading="generating && generatingRow === null"
            :aria-describedby="generateDescribedBy"
            :aria-label="barPair ? `Generate one invoice for each of the ${selected.length} selected payments` : undefined"
            class="block-on-phone bar-pair"
            data-test="generate-selected"
            @click="generateSelected"
          >
            {{ barPair ? `As ${selected.length} invoices` : generateLabel }}
          </AspButton>
        </div>
        <!-- Why Set category cannot act on this selection, in terms the
             owner can fix here (§3.114). -->
        <p v-if="mixedSelection" id="set-category-hint" class="create__hint" data-test="set-category-hint">
          Choose only money in or only money out to set a category
        </p>
        <!-- What else an armed Remove does, said before it acts. -->
        <p v-if="confirmingRemove && removeConsequence" id="bulk-remove-hint" class="create__hint" data-test="bulk-remove-consequence">
          {{ removeConsequence }}
        </p>
        <!-- States why Create invoice and Generate invoices cannot act, in
             terms the owner can fix here; the server is still the rule (only
             paid work is invoiced). One line for the pair. -->
        <p v-if="createCaption" id="create-invoice-hint" class="create__hint" data-test="create-invoice-hint">
          {{ createCaption }}
        </p>
        <!-- Generate's own reason, when the pair's line has nothing to say
             (§3.114; Design ack c71060). -->
        <p v-if="generateCaption" id="generate-hint" class="create__hint" data-test="generate-hint">
          {{ generateCaption }}
        </p>
        <!-- With two or more ticked the two buttons do different things with
             the same rows, so the line says which does what before a press. -->
        <p v-else-if="pairHint" id="generate-pair-hint" class="create__hint" data-test="generate-pair-hint">
          {{ pairHint }}
        </p>
      </component>
      </Teleport>
    </div>
    <!-- On a phone these lead the bar while it shows (above); with nothing
         ticked there is no bar, so a failure is said here. -->
    <template v-if="!barShown">
      <p v-if="bulkError" class="error" role="alert" data-test="bulk-error">{{ bulkError }}</p>
      <p v-if="createError" class="error" role="alert" data-test="create-error">{{ createError }}</p>
      <p v-if="generateError" class="error" role="alert" data-test="generate-error">{{ generateError }}</p>
    </template>

    <AspEmptyState
      v-if="rows.length === 0"
      heading="Nothing recorded yet"
      message="Enter a payment or an expense by hand, or import a PayPal CSV or Excel file, or an N26 CSV export or PDFs."
      data-test="payments-empty"
    />
    <AspEmptyState
      v-else-if="shown.length === 0"
      variant="filtered"
      heading="Nothing matches this filter"
      data-test="payments-filtered-empty"
    />
    <!-- §3.145: the list folds by the month the money moved, newest first.
         The one "select all" sits above the months on both layouts and counts
         rows in open months only (Decision 5). -->
    <template v-else>
    <div v-if="selectableShown.length" class="select-all" data-test="select-all-shown">
      <AspCheckbox
        :model-value="allShownSelected"
        :indeterminate="someShownSelected"
        :label="`Select all ${selectableShown.length} shown`"
        @update:model-value="selectAllShown"
      />
    </div>
    <details
      v-for="group in groups"
      :key="group.key"
      class="ledger-group"
      :open="openKeys.has(group.key)"
      data-test="ledger-group"
      :data-group="group.key"
      @toggle="onGroupToggle(group.key, $event)"
    >
    <summary class="fold-summary ledger-group__summary" data-test="ledger-group-summary">{{ group.label }} · {{ group.rows.length }}</summary>
    <!-- §3.114 card in §3.143 Decision 3's order: the checkbox, who top-left,
         the amount top-right, then the date and source muted, then what it
         was for, then the controls. -->
    <ul v-if="narrow" class="payment-cards" :aria-label="`Money in and out: ${group.label}`">
      <li
        v-for="row in group.rows"
        :key="row.key"
        class="payment-card"
        :class="{ 'payment-card--tap': !!(row.payment || row.expense) }"
        :data-test="row.direction === 'in' ? 'payment-row' : 'expense-row'"
        :data-txn="row.transaction_id"
        :data-row-key="row.key"
        :data-direction="row.direction"
        @click="onCardTap(row, $event)"
      >
        <div class="payment-card__top">
          <span class="payment-card__who">
            <AspCheckbox
              v-if="selectable(row)"
              :model-value="selected.includes(row.key)"
              :aria-label="`Select ${row.transaction_id}`"
              data-test="payment-select"
              @update:model-value="toggle(row.key, $event)"
            />
            <!-- A row no checkbox can act on keeps an invisible copy, so every
                 name starts on one edge: an issued invoice's payment
                 (§3.129 Decision 6, design_agent c62100). -->
            <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
            <span class="sender" data-test="row-who">{{ row.who || row.what || '—' }}</span>
          </span>
          <strong class="nowrap amount" :class="row.direction === 'in' ? 'in-amount' : 'out-amount'" data-test="row-amount">{{ signedAmount(row) }}</strong>
        </div>
        <span class="muted" data-test="row-date-line"><span class="nowrap">{{ formatDay(row.paid_on) }}</span> · <span data-test="row-source">{{ row.source }}</span></span>
        <span v-if="row.payment && row.payment.sender_email" class="muted">{{ row.payment.sender_email }}</span>
        <span v-if="row.who && row.what" class="note" data-test="row-what">{{ row.what }}</span>
        <template v-if="row.payment">
          <span v-if="row.payment.entry === 'manual'" class="muted manual-line" data-test="payment-manual">{{ manualLine(row.payment) }}</span>
          <!-- Read as text on a phone; tapping the card opens Edit payment,
               which has both selects (§3.143 Decision 5). The two labelled
               selects made each card about 310px, so a 390x844 screen held
               fewer than three (system_3 #11019-A4, UX walk AM2; Design ack
               c69874 item 5, amending §3.143 Decision 3's Phone clause).
               Muted, except "Uncategorised", which is the value that decides
               "does it still need an invoice?" (S2). The separator is joined
               to the category by a no-break space, so it never starts a line. -->
          <span class="category-line muted" data-test="row-category-client"><span
            :class="{ 'category-line__open': row.payment.category === 'uncategorised' }"
            data-test="row-category"
          >{{ row.categoryLabel }}</span>&nbsp;· <span data-test="row-client">{{ clientNameOf(row.payment) || 'no client' }}</span></span>
          <span v-if="isPayPalTransferIntoN26(row.payment)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
          <span v-if="row.invoice" class="muted invoice-line" data-test="row-invoice">{{ row.invoice }}</span>
          <!-- The card's one button (Design ack c71060 answer 4). A press
               generates and does not open the card (`onCardTap`). -->
          <AspButton
            v-if="canGenerateRow(row)"
            variant="secondary"
            size="sm"
            class="card-generate"
            :disabled="generating || creating || removing"
            :loading="generating && generatingRow === row.payment.id"
            :aria-label="`Generate invoice for ${row.transaction_id}`"
            data-test="row-generate"
            @click="generateRow(row.payment)"
          >
            Generate invoice
          </AspButton>
        </template>
        <!-- An expense's category reads as text here; it is set from the
             selection and the edit dialog (system_3 #10631, #10632). -->
        <span v-else class="muted" data-test="row-category">{{ row.categoryLabel }}</span>
        <span v-if="!inBook(row)" class="muted not-in-book" data-test="row-not-in-book">Not in the Book</span>
      </li>
    </ul>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="group.rows"
      row-key="key"
      density="compact"
      :caption="`Money in and out: ${group.label}`"
      :row-attrs="(row) => ({ 'data-test': row.direction === 'in' ? 'payment-row' : 'expense-row', 'data-txn': row.transaction_id, 'data-direction': row.direction, 'data-row-key': row.key })"
    >
      <template #cell-select="{ row }">
        <AspCheckbox
          v-if="selectable(row)"
          :model-value="selected.includes(row.key)"
          :aria-label="`Select ${row.transaction_id}`"
          data-test="payment-select"
          @update:model-value="toggle(row.key, $event)"
        />
        <AspCheckbox v-else :model-value="false" class="select-gutter" aria-hidden="true" tabindex="-1" data-test="payment-select-gutter" />
      </template>
      <!-- The source is a fact about the row, on its muted date line
           (§3.143 Decision 3). -->
      <template #cell-paid_on="{ row }">
        <span class="nowrap">{{ formatDay(row.paid_on) }}</span>
        <span class="muted" data-test="row-source">{{ row.source }}</span>
      </template>
      <!-- Who, then what it was for under it, as on the phone card: a column
           of its own left too little width for the selects at 1280 with the
           sidebar open (#8407). -->
      <template #cell-who="{ row }">
        <span class="sender" data-test="row-who">{{ row.who || row.what || '—' }}</span>
        <span v-if="row.payment && row.payment.sender_email" class="muted">{{ row.payment.sender_email }}</span>
        <span v-if="row.who && row.what" class="note note--cell" data-test="row-what">{{ row.what }}</span>
        <template v-if="row.payment">
          <!-- A hand-entered payment's method and reference; no extra column
               for Delete (the table fills 968px). -->
          <span v-if="row.payment.entry === 'manual'" class="muted manual-line" data-test="payment-manual">{{ manualLine(row.payment) }}</span>
          <!-- The client as text, as on the phone card; changed in Edit
               payment. A payment with none says so, so a missing client is
               seen before a review opens (Design ack c71060, D2). -->
          <span class="client-line" :class="{ muted: !clientNameOf(row.payment) }" data-test="row-client">{{ clientNameOf(row.payment) || 'No client' }}</span>
          <!-- §3.143 Decision 5 (D12): the row's Edit replaces its Delete;
               removing moves into the dialog. An issued invoice's payment
               opens read-only. An expense row's Edit, below, opens the
               expense dialog the same way (system_3 #10695). -->
          <AspButton variant="ghost" size="sm" class="manual-delete" data-test="payment-edit" @click="openEdit(row.payment)">Edit</AspButton>
        </template>
        <AspButton v-else-if="row.expense" variant="ghost" size="sm" class="manual-delete" data-test="expense-edit" @click="openExpenseEdit(row.expense)">Edit</AspButton>
      </template>
      <template #cell-category="{ row }">
        <div v-if="row.payment" class="cell-select">
          <AspSelect
            :model-value="row.payment.category"
            :options="categoryOptionsFor(row.payment)"
            :aria-label="`Category for ${row.transaction_id}`"
            :disabled="saving.has(row.key)"
            data-test="payment-category"
            @update:model-value="patch(row.payment, { category: $event })"
          />
          <span v-if="isPayPalTransferIntoN26(row.payment)" class="muted paid-work-reason" data-test="payment-no-paid-work-reason">Not paid work -- the PayPal payments it sums are, in the PayPal import</span>
        </div>
        <span v-else data-test="row-category">{{ row.categoryLabel }}</span>
        <!-- §3.143 Decision 3: the row the Book does not count says so. -->
        <span v-if="!inBook(row)" class="muted not-in-book" data-test="row-not-in-book">Not in the Book</span>
      </template>
      <!-- One of three things (Design ack c71060): "Generate invoice" on a
           row that can be invoiced, the invoice's line on a row that has one,
           and nothing on any other row, because no action there would enable
           the button (§3.159 Decision 1: absent, not disabled). -->
      <template #cell-invoice="{ row }">
        <AspButton
          v-if="canGenerateRow(row)"
          variant="secondary"
          size="sm"
          :disabled="generating || creating || removing"
          :loading="generating && generatingRow === row.payment.id"
          :aria-label="`Generate invoice for ${row.transaction_id}`"
          data-test="row-generate"
          @click="generateRow(row.payment)"
        >
          Generate invoice
        </AspButton>
        <span v-else-if="row.invoice" class="muted" data-test="row-invoice">{{ row.invoice }}</span>
      </template>
      <!-- §3.140 Decision 2: money in in body ink, money out in red with a
           minus sign, so colour is never the only signal. -->
      <template #cell-amount="{ row }">
        <span class="nowrap amount" :class="row.direction === 'in' ? 'in-amount' : 'out-amount'" data-test="row-amount">{{ signedAmount(row) }}</span>
      </template>
    </AspDataTable>
    </details>
    </template>
    <!-- Absent at zero (§3.133 Decision 5). -->
    <AspButton v-if="removedCount" variant="ghost" class="removed-show" data-test="removed-show" @click="openRemoved('all')">
      Show {{ removedCount }} removed row{{ removedCount === 1 ? '' : 's' }}
    </AspButton>
    </template>
    <p v-if="rowError" class="error" role="alert" data-test="payment-error">{{ rowError }}</p>

    <ManualPaymentDialog
      v-model:open="manualOpen"
      :clients="clients"
      @changed="changed"
      @saved="onManualSaved"
    />
    <!-- The same dialog edits a payment (§3.143 Decision 5, system_3 #10694). -->
    <ManualPaymentDialog v-model:open="editOpen" :payment="editPayment" :clients="clients" @changed="changed" />
    <ManualExpenseDialog
      v-model:open="expenseOpen"
      :categories="expenseCategories"
      @changed="onExpenseSaved"
      @category-added="expenseCategories = [...expenseCategories, $event]"
    />
    <!-- The same dialog edits an expense (§3.143 Decision 5, system_3 #10695). -->
    <ManualExpenseDialog
      v-model:open="expenseEditOpen"
      :expense="editExpense"
      :categories="expenseCategories"
      @changed="changed"
      @category-added="expenseCategories = [...expenseCategories, $event]"
    />
    <N26ImportDialog v-model:open="n26Open" :files="n26Files" :payments="payments" @imported="onN26Imported" />
    <PayPalExpensesDialog v-model:open="paypalExpensesOpen" :candidates="paypalExpenseCandidates" @done="onPayPalExpensesDone" />
    <PayersDialog
      v-model:open="payersOpen"
      :candidates="payerCandidates"
      :left-out="payerLeftOut"
      :clients="clients"
      @saved="onPayersSaved"
    />
  </section>
</template>

<script>
  import { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSegmented, AspSelect } from '@aspirant/design-system';
  import ManualExpenseDialog from './ManualExpenseDialog.vue';
  import ManualPaymentDialog from './ManualPaymentDialog.vue';
  import N26ImportDialog from './N26ImportDialog.vue';
  import RemovedRows from './RemovedRows.vue';
  import PayPalExpensesDialog from './PayPalExpensesDialog.vue';
  import PayersDialog from './PayersDialog.vue';
  import {
    CATEGORY_LABELS,
    METHOD_LABELS,
    N26_MAX_FILES,
    SKIP_REASON_LABELS,
    copyKeptSentence,
    countPrior,
    errorOf,
    formatDay,
    formatMoney,
    importPayPalCSV,
    listExpenseCategories,
    listPayerCandidates,
    payersSavedLine,
    parseN26PDFs,
    patchExpense,
    patchPayment,
    listRemovedExpenses,
    listRemovedPayments,
    removeExpenses,
    removePayments,
    createDraft,
  } from './api.js';
  import { transactionRows } from './ledgerRows.js';
  import { groupByMonth, landedRows, monthKey, monthSpanLabel, openGroupKeys } from './listGroups.js';
  import { countsInBook } from './bookSelection.js';

  // "2 of 5 kept their category: 2026-08-12 €40.00, 2026-08-14 €25.00 (on an
  // issued invoice; cancel it first)." One shared reason closes the line;
  // mixed reasons follow each row.
  // `row` is a Transactions row (ledgerRows.js), of either direction.
  function bulkFailureLine(failed, total) {
    const k = failed.length;
    const head = `${k} of ${total} kept ${k === 1 ? 'its' : 'their'} category: `;
    const name = (f) => `${formatDay(f.row.paid_on)} ${formatMoney(f.row.amount_cents, f.row.currency)}`;
    const shared = failed.every((f) => f.reason === failed[0].reason);
    if (shared) return `${head}${failed.map(name).join(', ')} (${failed[0].reason}).`;
    return `${head}${failed.map((f) => `${name(f)} (${f.reason})`).join(', ')}.`;
  }

  const PAYPAL_WRONG_FILE =
    "PayPal file: choose the CSV or Excel export from PayPal's activity download. A PDF statement cannot be read.";

  // PayPal import and categorisation (spec §4.3–4.4). Every payment starts
  // uncategorised; only "Paid work" can later be invoiced, and that rule is
  // the server's. Sender names, emails and notes are written by outside
  // payers, so they are only ever rendered as text interpolation.
  export default {
    name: 'PaymentsPanel',
    components: { AspButton, AspCard, AspCheckbox, AspDataTable, AspEmptyState, AspSegmented, AspSelect, ManualExpenseDialog, ManualPaymentDialog, N26ImportDialog, PayPalExpensesDialog, PayersDialog, RemovedRows },
    props: {
      payments: { type: Array, required: true },
      // Money out, in the same list (§3.143 Decision 3, system_3 #10630).
      expenses: { type: Array, default: () => [] },
      clients: { type: Array, required: true },
      // What the Book counts, for the "Not in the Book" flag; null unread.
      bookSelection: { type: Object, default: null },
      // `{ direction, category }` to open on, from the Book's "Review them".
      initialFilter: { type: Object, default: null },
      // Generating from rows (system_3 #11506): the view makes the call and
      // runs the review; the panel shows that it is under way, why it failed,
      // and afterwards what the review did.
      generating: { type: Boolean, default: false },
      generateError: { type: String, default: '' },
      reviewSummary: { type: String, default: '' },
    },
    emits: ['changed', 'open-invoice', 'generate', 'status-seen'],
    data() {
      return {
        importing: false,
        importError: '',
        summary: null,
        pendingFile: null,
        needsDateOrder: false,
        direction: 'all',
        directionOptions: [
          { value: 'all', label: 'All' },
          { value: 'in', label: 'In' },
          { value: 'out', label: 'Out' },
        ],
        categoryFilter: 'all',
        // Months ze opened or closed this visit, by key; a month not in here
        // takes the default. Kept through a refetch, never stored (§3.145
        // Decision 3).
        openGroups: {},
        // The same while a filter is active, when every month starts open
        // (§3.17 R2). Dropped whenever the filter changes or clears, so
        // clearing it brings back zir folds from before.
        filterOpen: {},
        // Where each row was (key -> month) when this panel last reported a
        // change of its own, a save, an import or a restore. The reload that
        // follows is compared against it; null until then, so the page's own
        // first loads (expenses arrive after payments) open nothing.
        revealFrom: null,
        revealCount: 0,
        // Set by an import, so its reload can name where the rows went; and
        // the months it named.
        importPending: false,
        landedIn: '',
        saving: new Set(),
        rowError: '',
        narrow: false,
        // The phone's selection bar, measured, so the list can scroll its
        // last card fully above it (§3.157 Decision 2).
        barHeight: 0,
        // The phone's "Add or import" fold (#11019-A2): it follows "the list
        // is empty" until ze toggles it or uses a way in, and then stays as ze
        // left it (foldUserOpen), so a first row never shuts it under zir.
        foldTouched: false,
        foldUserOpen: false,
        // Row keys (`p<id>` / `e<id>`, ledgerRows.js), never bare ids:
        // payment and expense ids share one number space (security c66333
        // on system_3 #10630, carried to #10631 in c66336).
        selected: [],
        // The payment whose row button started the generation under way, or
        // null when the toolbar's did (or none is).
        generatingRow: null,
        confirmingRemove: false,
        removing: false,
        expenseCategoriesRequested: false,
        bulkSaving: false,
        bulkError: '',
        creating: false,
        createError: '',
        manualOpen: false,
        editOpen: false,
        editPayment: null,
        expenseEditOpen: false,
        editExpense: null,
        expenseOpen: false,
        expenseCategories: [],
        manualSummary: null,
        n26Parsing: false,
        n26Open: false,
        // The removed view (§3.143 Decision 6, system_3 #10633).
        removedPayments: [],
        removedExpenses: [],
        removedOpen: false,
        removedDirection: 'all',
        n26Files: [],
        n26Summary: null,
        // §3.142 Decision 5: unlinked payers after an import, offered in the
        // payers dialog, and that dialog's result line.
        payerCandidates: [],
        payerLeftOut: {},
        payersOpen: false,
        payersSummary: null,
        // The last PayPal file's outgoing payments, offered as expenses
        // (system_3 #10438), and how many the owner added.
        paypalExpenseCandidates: [],
        paypalExpensesOpen: false,
        paypalExpensesAdded: 0,
        // What the PayPal expense confirm counted as removed or deleted
        // earlier: { removed, deleted } (server PR 196).
        paypalExpensePrior: { removed: 0, deleted: 0 },
        columns: [
          { key: 'select', label: '', sortable: false, width: '2.5rem' },
          // Every column has a width and the layout is fixed, so the columns
          // line up from one month's table to the next (§3.145 Decision 6).
          // "Who and what for" takes what the others leave.
          // "Date paid", the Book's header for the same day (§3.159 Decision 6,
          // system_3 #11502): the day the money moved (§3.145).
          { key: 'paid_on', label: 'Date paid', width: '7.5rem' },
          { key: 'who', label: 'Who and what for', sortable: false },
          // Width measured at 1280 with the sidebar open, where the table has
          // 968px (#8407): the cell pads 12px a side and a table-cell trigger
          // ~32px, so 10.25rem shows "Uncategorised" (106px of text) whole.
          // Longer values end in an ellipsis with the whole label as the
          // trigger's title.
          { key: 'category', label: 'Category', sortable: false, width: '10.25rem' },
          // The row's Client select stood here until system_3 #11506: the
          // operator asked for "a button replacing the client button … to
          // directly generate the invoice for that entry" (c70806 on #10985;
          // Design ack c71060). The client reads as text under who.
          { key: 'invoice', label: 'Invoice', sortable: false, width: '10.25rem' },
          // Last, as the row reads (§3.143 Decision 3).
          { key: 'amount', label: 'Amount', align: 'right', sortable: false, width: '8rem' },
        ],
      };
    },
    computed: {
      // Only rows the server marks removed: a list read without the removed
      // flag counts zero, whatever answered it.
      removedCount() {
        return this.removedPayments.length + this.removedExpenses.length;
      },
      // The PayPal line's counts of payments matching a record ze removed or
      // deleted for good (§3.143 Decision 6, design_agent c66225). Server
      // `duplicates` includes them, so "already imported" leaves them out.
      // Payments only: the file's outgoing rows are already counted as
      // skipped, so counting them here too would break the line's sum
      // (§3.130; #10634 dogfood, c66307). They are counted on the expense
      // sentence instead (paypalExpenses).
      paypalPrior() {
        const s = this.summary || {};
        return {
          already: Math.max(0, (s.duplicates || 0) - (s.removed_earlier || 0) - (s.deleted_earlier || 0)),
          removed: s.removed_earlier || 0,
          deleted: s.deleted_earlier || 0,
        };
      },
      // The expense sentence's counts: expenses added, and outgoing rows
      // matching an expense ze removed or deleted for good, from the
      // review's flags plus any its confirm met (c66307).
      paypalExpenses() {
        const exp = countPrior(this.paypalExpenseCandidates);
        return {
          added: this.paypalExpensesAdded,
          removed: exp.removed + this.paypalExpensePrior.removed,
          deleted: exp.deleted + this.paypalExpensePrior.deleted,
        };
      },
      n26Expenses() {
        const s = this.n26Summary || {};
        return {
          added: s.expenses_added || 0,
          removed: s.expenses_removed_earlier || 0,
          deleted: s.expenses_deleted_earlier || 0,
        };
      },
      incoming() {
        return this.payments.filter((p) => p.kind === 'incoming');
      },
      // Both directions in one list, newest first (§3.143 Decision 3).
      rows() {
        return transactionRows(this.incoming, this.expenses);
      },
      // Open while the list is empty, where adding is the only next step
      // (Design ack c69874 item 1, D1); closed otherwise, until touched.
      foldOpen() {
        return this.foldTouched ? this.foldUserOpen : this.rows.length === 0;
      },
      shown() {
        return this.rows.filter(
          (r) =>
            (this.direction === 'all' || r.direction === this.direction) &&
            (this.categoryFilter === 'all' || r.category === this.categoryFilter),
        );
      },
      categoryOptions() {
        return Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
      },
      // The category select's options follow the direction: income
      // categories, expense categories, or both (§3.143 Decision 3). Under
      // All they sit in two AspSelect groups, In then Out, with bare labels:
      // "Other" is both an income and an expense category, and the group
      // names its side (design_agent c66290 on system_3 #10630). "All
      // categories" stays a plain option above both groups, so ze always has
      // a way back to every row (c66693 on #10702). Under In or Out the list
      // is flat. Expense categories are the ones zir rows carry: the panel
      // makes no categories request until the expense dialog opens
      // (invoicing.spec, invoicing-n26.spec). Values carry the direction too,
      // so a filter never matches the other side.
      filterOptions() {
        const income = this.categoryOptions.map((o) => ({ value: `in:${o.value}`, label: o.label }));
        const names = [...new Set(this.expenses.map((e) => e.category))].sort((x, y) => x.localeCompare(y));
        const expense = names.map((n) => ({ value: `out:${n}`, label: n }));
        const all = { value: 'all', label: 'All categories' };
        if (this.direction === 'in') return [all, ...income];
        if (this.direction === 'out') return [all, ...expense];
        const groups = [{ group: 'In', options: income }];
        if (expense.length) groups.push({ group: 'Out', options: expense });
        return [all, ...groups];
      },
      // A file that could not be read stays named after the dialog closes
      // (D2: a fold may hide detail, never a failure).
      // Transfers from PayPal the server left out of the N26 files (#9881).
      // "left out" is the rule; "skipped" stays zir own unticking (c61091).
      n26PayPalClause() {
        const n = (this.n26Summary && this.n26Summary.paypal_transfers) || 0;
        return n === 1
          ? '1 transfer from PayPal left out (its payments come in through PayPal)'
          : `${n} transfers from PayPal left out (their payments come in through PayPal)`;
      },
      // Moves between zir own account and a Space that the server left out
      // of a statement (system_3 #10541): the statement's analogue of the
      // PayPal clause above, kept short because the review dialog already
      // gave the full reason (design_agent c65358).
      n26SpaceTransferClause() {
        const n = (this.n26Summary && this.n26Summary.space_transfers) || 0;
        return n === 1
          ? '1 move between your account and a Space left out (your own money)'
          : `${n} moves between your account and your Spaces left out (your own money)`;
      },
      // A recognised file that read no transaction stays named after the
      // dialog closes, like a failure (design_agent c65358).
      // A file that read no rows is a recorded failure; the server says when
      // its kept copy goes, if one was kept (#10567).
      paypalCopyKept() {
        return copyKeptSentence(this.summary && this.summary.copy_expires_at);
      },
      n26UnreadableLine() {
        const files = (this.n26Summary && this.n26Summary.unreadable) || [];
        const n = files.length;
        return `${n} file${n === 1 ? '' : 's'} read no transaction: ${files.join(', ')}.`;
      },
      payersClause() {
        const n = this.payerCandidates.length;
        return n === 1 ? '1 payer is not in your client book.' : `${n} payers are not in your client book.`;
      },
      n26FailureLine() {
        const failures = (this.n26Summary && this.n26Summary.failures) || [];
        const n = failures.length;
        const list = failures.map((f) => `${f.filename} (${f.reason})`).join(', ');
        return `${n} file${n === 1 ? '' : 's'} could not be read: ${list}.`;
      },
      // The PayPal file type, named on every PayPal line (§3.127 D4): what the
      // server read once it answered, otherwise the file the owner chose.
      paypalNoun() {
        if (this.summary && this.summary.format) return this.summary.format === 'xlsx' ? 'Excel file' : 'CSV';
        const f = this.pendingFile;
        const xlsx = f && (/\.xlsx$/i.test(f.name || '') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return xlsx ? 'Excel file' : 'CSV';
      },
      // The selected Transactions rows, in list order, by key.
      selectedRows() {
        return this.rows.filter((r) => this.selected.includes(r.key));
      },
      selectedPayments() {
        return this.selectedRows.filter((r) => r.direction === 'in');
      },
      selectedExpenses() {
        return this.selectedRows.filter((r) => r.direction === 'out');
      },
      // Money in and money out at once: Set category acts on one direction
      // at a time, because the two have different categories (§3.143
      // Decision 4).
      mixedSelection() {
        return this.selectedPayments.length > 0 && this.selectedExpenses.length > 0;
      },
      canSetCategory() {
        return this.selected.length > 0 && !this.mixedSelection;
      },
      // Money out offers zir expense categories: the server's list once
      // loaded, plus any zir rows carry, so a select opened before the list
      // arrives still offers the categories in view.
      setCategoryOptions() {
        if (!this.selectedExpenses.length) return this.categoryOptions;
        const names = new Set([...this.expenseCategories.map((c) => c.name), ...this.expenses.map((e) => e.category)]);
        return [...names].filter(Boolean).sort((x, y) => x.localeCompare(y)).map((n) => ({ value: n, label: n }));
      },
      // Not invoiceable: money out, or money in not marked Paid work.
      notPaidWork() {
        return this.selectedRows.filter((r) => r.direction === 'out' || r.payment.category !== 'paid_work').length;
      },
      canCreate() {
        return this.selected.length > 0 && this.notPaidWork === 0;
      },
      // Why Create invoice and Generate invoices cannot act, in terms the
      // owner can fix from the panel (§3.114); neither quietly invoices the
      // Paid work subset (D13). One line for the pair: both are disabled for
      // the same reason, so both point at it (design_agent c71081 on #11506).
      createCaption() {
        const n = this.selected.length;
        if (n === 0) return 'Select rows to set their category or remove them, or paid-work payments to invoice them.';
        const k = this.notPaidWork;
        if (k === 0) return '';
        return `${k} of the ${n} selected ${k === 1 ? 'is' : 'are'} not Paid work. Untick ${k === 1 ? 'it' : 'them'} to create or generate invoices.`;
      },
      // Below 640px the selection's actions are a bar at the bottom of the
      // screen, there only while a row is ticked (§3.157 Decision 2).
      barShown() {
        return this.narrow && this.selected.length > 0;
      },
      // In the phone's bar, two or more ticked rows offer the pair under its
      // lead line; one ticked row offers the primary alone.
      barPair() {
        return this.narrow && this.selected.length > 1;
      },
      // Any import, hand entry or payers result showing in the status region.
      statusRegionBusy() {
        return Boolean(this.summary || this.n26Summary || this.manualSummary || this.payersSummary);
      },
      // How many invoices the review will show for this selection (Design
      // ack c71060): the ticked paid-work payments with no invoice yet, plus
      // those whose draft is waiting. One on an issued invoice is skipped by
      // the server and is not counted. 0 while a ticked row is not Paid work.
      generatable() {
        if (!this.canCreate) return 0;
        return this.selectedPayments.filter((r) => !r.payment.invoice || r.payment.invoice.status === 'draft').length;
      },
      // "Generate 3 invoices": one per ticked payment, which is what sets it
      // apart from "Create invoice from 3 payments" beside it.
      generateLabel() {
        const n = this.generatable;
        if (n === 1) return 'Generate invoice';
        return n ? `Generate ${n} invoices` : 'Generate invoices';
      },
      // Generate's own reason, the one case the pair's line does not cover:
      // every ticked payment is Paid work, and each is already on an issued
      // invoice.
      generateCaption() {
        return this.canCreate && !this.generatable ? 'Every ticked payment already has an invoice.' : '';
      },
      pairHint() {
        const n = this.selected.length;
        // On a phone the bar's lead line and labels already say it.
        if (this.narrow || !this.generatable || n < 2) return '';
        return `Generate makes one invoice per payment. Create invoice puts all ${n} on one.`;
      },
      generateDescribedBy() {
        if (this.createCaption) return 'create-invoice-hint';
        if (this.generateCaption) return 'generate-hint';
        return this.pairHint ? 'generate-pair-hint' : undefined;
      },
      // The count in the trigger is what makes a one-pick bulk write safe
      // without a confirm step (design_agent c60951 rule 4).
      setCategoryPlaceholder() {
        const n = this.selected.length;
        // In the phone's bar the trigger sits beside Remove, where the long
        // form needs 216px and has 156px: "Set category (12)", the count in
        // the same form as "Remove (12)" (ruling c71232 on system_3 #11019).
        if (this.narrow && n) return `Set category (${n})`;
        return n ? `Set category of ${n} selected` : 'Set category of selected rows';
      },
      // What the trigger is called when its visible text is the short form.
      setCategoryName() {
        return this.narrow && this.selected.length ? `Set category of ${this.selected.length} selected` : undefined;
      },
      // "Remove (N)", armed "Remove N rows" (§3.143 Decision 4).
      removeLabel() {
        const n = this.selected.length;
        if (this.confirmingRemove) return `Remove ${n} row${n === 1 ? '' : 's'}`;
        return n ? `Remove (${n})` : 'Remove';
      },
      // What else an armed Remove does: a payment on a draft comes off it,
      // as the server does on remove (aspirant-server invoicing_remove.go).
      removeConsequence() {
        const k = this.selectedPayments.filter((r) => r.payment.invoice && r.payment.invoice.status === 'draft').length;
        if (!k) return '';
        if (this.selected.length === 1) return 'It is also taken off its draft invoice.';
        if (k === this.selected.length) return 'They are also taken off their draft invoices.';
        return `${k} of them ${k === 1 ? 'is' : 'are'} also taken off ${k === 1 ? 'its draft invoice' : 'their draft invoices'}.`;
      },
      // The shown rows a checkbox can act on: not on an issued invoice
      // (§3.129 Decisions 4 and 6, design_agent c62100 on #10010).
      filtered() {
        return this.direction !== 'all' || this.categoryFilter !== 'all';
      },
      // The shown rows by the month the money moved, newest month first
      // (§3.145 Decision 1); `rows` is already newest day first.
      groups() {
        return groupByMonth(this.shown, (r) => r.paid_on);
      },
      // Open now: every month under a filter, else zir own choice, else the
      // newest month (§3.145 Decision 3, §3.17 R2 and R3).
      openKeys() {
        const newest = this.groups.length ? this.groups[0].key : '';
        return openGroupKeys(this.groups, {
          filtered: this.filtered,
          chosen: this.openGroups,
          chosenWhileFiltered: this.filterOpen,
          defaultOpen: (g) => g.key === newest,
        });
      },
      // The rows ze can see: a folded month's rows are not shown (§3.129).
      visibleRows() {
        return this.groups.filter((g) => this.openKeys.has(g.key)).flatMap((g) => g.rows);
      },
      selectableShown() {
        return this.visibleRows.filter((r) => this.selectable(r));
      },
      allShownSelected() {
        return this.selectableShown.length > 0 && this.selectableShown.every((r) => this.selected.includes(r.key));
      },
      someShownSelected() {
        return !this.allShownSelected && this.selectableShown.some((r) => this.selected.includes(r.key));
      },
      skippedReasons() {
        const reasons = (this.summary && this.summary.skipped_reasons) || {};
        return Object.entries(reasons).map(([key, count]) => ({ key, count, label: SKIP_REASON_LABELS[key] || key }));
      },
    },
    watch: {
      // Every refetch of the lists (a save, an import, a restore) re-reads
      // the removed rows too, so the count and the view stay true.
      payments() {
        this.loadRemoved();
      },
      expenses() {
        this.loadRemoved();
      },
      // The review's line has been read once another result takes the status
      // region (a new tick clears it too, in `selected` below).
      statusRegionBusy(busy) {
        if (busy && this.reviewSummary) this.$emit('status-seen');
      },
      // The bar's height follows its content (a caption, an armed Remove, a
      // failure line), and the list's bottom padding follows the bar.
      barShown(shown) {
        this.watchBar(shown);
      },
      // A generation that went through leaves nothing ticked, like Create
      // invoice; one that failed keeps the ticks, so ze can press again.
      generating(now, was) {
        if (!was || now) return;
        if (this.generatingRow === null && !this.generateError) this.selected = [];
        this.generatingRow = null;
      },
      // The selection never holds a row the owner cannot see (§3.25): a
      // filter change, a reload or a folded month unselects rows that left
      // the view (§3.145 Decision 5).
      visibleRows(rows) {
        const visible = new Set(rows.filter((r) => this.selectable(r)).map((r) => r.key));
        const kept = this.selected.filter((key) => visible.has(key));
        if (kept.length !== this.selected.length) this.selected = kept;
      },
      // Any change of filter starts every month open again (§3.17 R2), and
      // clearing the last one brings back zir folds from before.
      direction() {
        this.filterOpen = {};
      },
      categoryFilter() {
        this.filterOpen = {};
      },
      // After a save, an import or a restore: every month that holds a new
      // row, or a row whose date moved it there, opens, and the newest of
      // them is brought into view (§3.145 Decision 2). Compared against the
      // snapshot `changed()` took, so only this panel's own changes count,
      // and the two reloads that follow one change (payments, then
      // expenses) give the same answer.
      rows(now) {
        if (!this.revealFrom) return;
        const landed = landedRows(this.revealFrom, groupByMonth(now, (r) => r.paid_on), (r) => r.key);
        if (this.importPending) this.landedIn = monthSpanLabel(landed.map((l) => l.group));
        if (!landed.length) return;
        const open = { ...this.openGroups };
        for (const l of landed) open[l.group] = true;
        this.openGroups = open;
        if (landed.length <= this.revealCount) return;
        this.revealCount = landed.length;
        this.$nextTick(() => {
          // The newest landed row the current filter shows.
          const shown = new Set(this.shown.map((r) => r.key));
          const first = landed.find((l) => shown.has(l.key));
          const el = first && this.$el.querySelector(`[data-row-key="${first.key}"]`);
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
      },
      // An armed Remove names a count; any change to the selection disarms
      // it, so the second press always removes what the label said.
      // A new tick also means the last review's line has been read.
      selected(keys) {
        this.confirmingRemove = false;
        if (keys.length && this.reviewSummary) this.$emit('status-seen');
      },
      // Set category's money-out options: zir full expense category list,
      // asked for once, the first time the selection holds money out. Never
      // with the panel, so an import makes no categories request
      // (invoicing.spec, invoicing-n26.spec).
      selectedExpenses(rows) {
        if (rows.length && !this.expenseCategoriesRequested) {
          this.expenseCategoriesRequested = true;
          this.loadExpenseCategories();
        }
      },
      // A category the new direction does not offer falls back to all.
      filterOptions(options) {
        const flat = options.flatMap((o) => o.options || [o]);
        if (!flat.some((o) => o.value === this.categoryFilter && !o.disabled)) this.categoryFilter = 'all';
      },
    },
    mounted() {
      // The Book's "Review them" opens this tab on In plus Uncategorised
      // (§3.143 Decision 7). Direction first: the category options follow it.
      if (this.initialFilter) {
        this.direction = this.initialFilter.direction;
        this.categoryFilter = this.initialFilter.category;
      }
      this.loadRemoved();
      // Seven columns do not fit a phone: below 640px the same rows render
      // as stacked cards, so the selects stay on screen without a sideways
      // scroll.
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.narrow = this.narrowQuery.matches;
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
    },
    beforeUnmount() {
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
      this.watchBar(false);
    },
    methods: {
      // Any click inside the fold, its summary included, freezes the state it
      // shows now; a toggle that differs from it is the person's own.
      onFoldClick() {
        if (this.foldTouched) return;
        this.foldUserOpen = this.foldOpen;
        this.foldTouched = true;
      },
      // `toggle` also fires when Vue sets `open` itself; that one matches
      // foldOpen and changes nothing.
      onFoldToggle(event) {
        if (!this.narrow) return;
        const open = event.target.open;
        if (open === this.foldOpen) return;
        this.foldTouched = true;
        this.foldUserOpen = open;
      },
      // The removed rows for the count, the ghost and the view. A failed read
      // shows no ghost and leaves the list as it is.
      async loadRemoved() {
        const [p, e] = await Promise.allSettled([listRemovedPayments(), listRemovedExpenses()]);
        this.removedPayments = p.status === 'fulfilled' ? p.value.filter((r) => r.removed_at) : [];
        this.removedExpenses = e.status === 'fulfilled' ? e.value.filter((r) => r.removed_at) : [];
        if (this.removedOpen && !this.removedCount) this.removedOpen = false;
      },
      // From the ghost ('all'), a payment clause on an import line ('in') or
      // an expense clause ('out'; c66316 on system_3 #10633).
      openRemoved(direction) {
        this.removedDirection = direction;
        this.removedOpen = true;
      },
      formatDay,
      formatMoney,
      payersSavedLine,
      // The Book counts this row (bookSelection.js). Unread, no row is flagged.
      inBook(row) {
        const source = row.payment || row.expense;
        if (!source) return true;
        return countsInBook(this.bookSelection, { direction: row.direction, category: source.category, kind: row.payment ? row.payment.kind : undefined });
      },
      // The import line's clauses for rows matching a removed or a deleted
      // record (design_agent c66225). Printed only when non-zero. "restore it
      // on Transactions" becomes the link to the removed view when that view
      // ships (system_3 #10633); a deleted row can never come back, so its
      // clause has nothing to link to.
      removedClause(n) {
        return `${n} removed earlier: restore it on Transactions`;
      },
      deletedClause(n) {
        return `${n} deleted earlier`;
      },
      // The expense sentence, zero parts left out: "1 expense added to your
      // book · 1 removed earlier: restore it on Transactions · 1 deleted
      // earlier". With none added it opens "Expenses:" instead, so no zero
      // is printed (c66307).
      expenseParts({ added, removed, deleted }) {
        const parts = [];
        if (added) parts.push({ key: 'added', text: `${added} expense${added === 1 ? '' : 's'} added to your book` });
        if (removed) parts.push({ key: 'removed', count: removed, text: this.removedClause(removed) });
        if (deleted) parts.push({ key: 'deleted', text: this.deletedClause(deleted) });
        return parts;
      },
      methodLabel(row) {
        return METHOD_LABELS[row.method] || row.method;
      },
      // "By hand" is on the date line; this line adds how and the reference.
      manualLine(p) {
        return p.reference ? `${this.methodLabel(p)} · ${p.reference}` : this.methodLabel(p);
      },
      // §3.140 Decision 2: money out carries a minus sign as well as its ink.
      signedAmount(row) {
        const amount = formatMoney(row.amount_cents, row.currency);
        return row.direction === 'out' ? `-${amount}` : amount;
      },
      // A checkbox acts on any expense, and on a payment no issued invoice
      // covers (§3.129 Decisions 4 and 6, §3.143 Decision 4): every action
      // on the selection would be refused for an issued invoice's payment.
      selectable(row) {
        return row.direction === 'out' || !row.payment.on_issued_invoice;
      },
      // Mirrors the server's isPayPalTransferIntoN26 (invoicing_n26.go):
      // an N26 row whose payer is PayPal. The PayPal payments it sums are
      // the paid work, so the transfer itself can never be (#9940-A1,
      // operator c61402).
      // The phone card's client, as text (#11019-A4); '' when none is linked.
      clientNameOf(payment) {
        const c = payment.client_id ? this.clients.find((x) => x.id === payment.client_id) : null;
        return c ? c.name : '';
      },
      isPayPalTransferIntoN26(row) {
        return row.source === 'n26' && (row.sender_name || '').toLowerCase().includes('paypal');
      },
      categoryOptionsFor(row) {
        if (!this.isPayPalTransferIntoN26(row)) return this.categoryOptions;
        return this.categoryOptions.map((o) => (o.value === 'paid_work' ? { ...o, disabled: true } : o));
      },
      openEdit(payment) {
        this.editPayment = payment;
        this.editOpen = true;
      },
      async openExpenseEdit(expense) {
        this.editExpense = expense;
        this.expenseEditOpen = true;
        await this.loadExpenseCategories();
      },
      // A phone card's body opens its row's dialog (§3.143 Decision 5); its
      // own controls (checkbox, selects, buttons) keep their own job.
      onCardTap(row, event) {
        if (!row.payment && !row.expense) return;
        if (event.target.closest('button, input, select, label, a, [role="combobox"], [role="listbox"], [role="option"], .select')) return;
        if (row.payment) this.openEdit(row.payment);
        else this.openExpenseEdit(row.expense);
      },
      onFileChosen(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        // "Import PayPal file" is looser than the formats it reads, and the
        // owner may hold PayPal's PDF statement: refuse anything but a CSV or
        // an .xlsx before sending it, and say what to bring (design_agent
        // c60973 on system_3 #9873; §3.127 Decision 5).
        if (!/\.(csv|xlsx)$/i.test(file.name || '')) {
          this.summary = null;
          this.n26Summary = null;
          this.manualSummary = null;
          this.payersSummary = null;
          this.needsDateOrder = false;
          this.importError = PAYPAL_WRONG_FILE;
          if (this.$refs.fileInput) this.$refs.fileInput.value = '';
          return;
        }
        this.pendingFile = file;
        this.runImport('');
      },
      reimport(order) {
        this.runImport(order);
      },
      // N26 import, step one: the server reads the PDFs and stores nothing;
      // the dialog then lets the owner confirm or skip each row.
      async onN26Chosen(event) {
        const files = [...((event.target && event.target.files) || [])];
        if (this.$refs.n26Input) this.$refs.n26Input.value = '';
        if (!files.length) return;
        this.importError = '';
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = null;
        this.payerCandidates = [];
        if (files.length > N26_MAX_FILES) {
          // The server's per-request cap counts CSVs the same as PDFs
          // (aspirant-server invoicing_n26.go maxN26FilesPerRequest).
          this.importError = `N26: choose at most ${N26_MAX_FILES} files at a time.`;
          return;
        }
        this.n26Parsing = true;
        try {
          this.n26Files = await parseN26PDFs(files);
          this.n26Open = true;
        } catch (err) {
          this.importError = `N26: ${errorOf(err).message}`;
        } finally {
          this.n26Parsing = false;
        }
      },
      // The page refetches its lists, the Book's expenses among them, on
      // 'changed'. An expense added in either review must trigger it, or the
      // Book tab shows it only after a reload (system_3 #10432).
      onPayPalExpensesDone(result) {
        this.paypalExpensesAdded = (result && result.confirmed) || 0;
        this.paypalExpensePrior = {
          removed: (result && result.removed_earlier) || 0,
          deleted: (result && result.deleted_earlier) || 0,
        };
        if (this.paypalExpensesAdded) this.importChanged(true);
      },
      onN26Imported(summary) {
        this.n26Summary = summary;
        this.manualSummary = null;
        this.payersSummary = null;
        this.refreshPayerCandidates();
        if (summary.imported || summary.expenses_added) this.importChanged();
      },
      // The offer is optional: a failed read shows no clause and no button,
      // and the list itself is unaffected.
      async refreshPayerCandidates() {
        try {
          const { payers, leftOut } = await listPayerCandidates();
          this.payerCandidates = payers;
          this.payerLeftOut = leftOut;
        } catch (err) {
          this.payerCandidates = [];
          this.payerLeftOut = {};
        }
      },
      onPayersSaved(result) {
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = { clients_added: result.clients_added || 0, payments_linked: result.payments_linked || 0 };
        this.payerCandidates = [];
        this.changed();
      },
      // §3.142 Decision 1: one line in the shared import-state region, same
      // "one summary shows at a time" rule as the two imports (§3.127
      // Decision 4). `client` is only present when the save also added a
      // payer (Decision 3).
      // Categories load when the expense dialog opens, never with the panel:
      // an import must make no categories request (invoicing.spec,
      // invoicing-n26.spec), and most visits never open this dialog.
      async openExpense() {
        this.expenseOpen = true;
        await this.loadExpenseCategories();
      },
      async loadExpenseCategories() {
        try {
          this.expenseCategories = await listExpenseCategories();
        } catch {
          // The dialog's category select is empty, and Set category offers
          // the categories zir rows carry; the server still refuses an
          // unknown category, so nothing wrong can be stored.
        }
      },
      onExpenseSaved() {
        this.summary = null;
        this.n26Summary = null;
        this.payersSummary = null;
        this.manualSummary = { expense: true };
        this.changed();
      },
      onManualSaved({ payment, client }) {
        this.summary = null;
        this.n26Summary = null;
        this.payersSummary = null;
        this.manualSummary = {
          gross_cents: payment.gross_cents,
          currency: payment.currency,
          sender_name: payment.sender_name,
          client_name: client ? client.name : '',
        };
      },
      async runImport(dateOrder) {
        this.importing = true;
        this.importError = '';
        this.summary = null;
        this.n26Summary = null;
        this.manualSummary = null;
        this.payersSummary = null;
        this.payerCandidates = [];
        this.paypalExpensesAdded = 0;
        this.paypalExpensePrior = { removed: 0, deleted: 0 };
        try {
          const { summary, expenseCandidates } = await importPayPalCSV(this.pendingFile, dateOrder);
          this.summary = summary;
          this.needsDateOrder = false;
          this.refreshPayerCandidates();
          this.importChanged();
          // Offer the outgoing payments only when one is new to the book.
          this.paypalExpenseCandidates = expenseCandidates;
          this.paypalExpensesOpen = expenseCandidates.some((row) => !row.already_imported);
        } catch (err) {
          const failure = errorOf(err);
          if (failure.code === 'date_order_ambiguous') {
            this.needsDateOrder = true;
          } else {
            // The server's messages mostly end unpunctuated; the sentence
            // that follows needs its own full stop before it (#10567).
            const kept = copyKeptSentence(failure.copyExpiresAt);
            const line = `PayPal ${this.paypalNoun}: ${failure.message}`;
            this.importError = kept ? `${line}${/[.!?]$/.test(line) ? '' : '.'} ${kept}` : line;
          }
        } finally {
          this.importing = false;
          if (this.$refs.fileInput) this.$refs.fileInput.value = '';
        }
      },
      // Records only zir own toggles: a change the page made itself (a
      // filter, a default) already matches what `openKeys` says. Zir toggle
      // also ends the reveal, so a late reload cannot reopen what ze closed.
      onGroupToggle(key, event) {
        const open = event.target.open;
        if (open === this.openKeys.has(key)) return;
        this.revealFrom = null;
        if (this.filtered) this.filterOpen = { ...this.filterOpen, [key]: open };
        else this.openGroups = { ...this.openGroups, [key]: open };
      },
      // Every change this panel reports goes through here: it notes where
      // each row is now, so the reload can open the months rows land in.
      snapshotRows() {
        this.revealFrom = new Map(this.rows.map((r) => [r.key, monthKey(r.paid_on)]));
        this.revealCount = 0;
      },
      changed() {
        this.snapshotRows();
        this.importPending = false;
        this.$emit('changed');
      },
      // An import's reload also names the months its rows went to. A second
      // step of the same import (the PayPal expenses) keeps the first step's
      // snapshot, so the line names both.
      importChanged(sameImport = false) {
        if (!(sameImport && this.importPending && this.revealFrom)) {
          this.snapshotRows();
          this.landedIn = '';
        }
        this.importPending = true;
        this.$emit('changed');
      },
      toggle(key, on) {
        this.selected = on ? [...new Set([...this.selected, key])] : this.selected.filter((x) => x !== key);
      },
      selectAllShown(on) {
        const keys = this.selectableShown.map((r) => r.key);
        this.selected = on ? [...new Set([...this.selected, ...keys])] : this.selected.filter((key) => !keys.includes(key));
      },
      // Set one category on every selected row, all of one direction: one
      // PATCH per row, in list order, to the payment or the expense the row
      // is. Rows that succeed leave the selection; rows the server refuses
      // stay selected and are named in one alert that stays until the next
      // bulk action (design_agent c60951 rule 5, D2).
      async setCategory(category) {
        if (!category || !this.canSetCategory || this.bulkSaving) return;
        const rows = this.selectableShown.filter((r) => this.selected.includes(r.key));
        this.bulkSaving = true;
        this.bulkError = '';
        const failed = [];
        for (const row of rows) {
          this.saving = new Set([...this.saving, row.key]);
          try {
            if (row.direction === 'out') await patchExpense(row.id, { category });
            else await patchPayment(row.id, { category });
          } catch (err) {
            const failure = errorOf(err);
            const reason = failure.code === 'payment_on_issued_invoice' ? 'on an issued invoice; cancel it first' : failure.message;
            failed.push({ row, reason });
          } finally {
            const next = new Set(this.saving);
            next.delete(row.key);
            this.saving = next;
          }
        }
        this.selected = failed.map((f) => f.row.key);
        if (failed.length) this.bulkError = bulkFailureLine(failed, rows.length);
        this.bulkSaving = false;
        this.changed();
      },
      // Remove the selection, a mistaken upload taken out in one go (§3.143
      // Decision 4). The first press arms; the second sends one
      // all-or-nothing request per table, payments first. A refused payment
      // request removes nothing, and the expenses are not sent. If the
      // expenses are refused after the payments went, the alert says which
      // part was removed, and the expenses stay selected.
      async removeSelected() {
        if (this.selected.length === 0 || this.removing) return;
        if (!this.confirmingRemove) {
          this.confirmingRemove = true;
          return;
        }
        const paymentIds = this.selectedPayments.map((r) => r.id);
        const expenseIds = this.selectedExpenses.map((r) => r.id);
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        this.removing = true;
        this.bulkError = '';
        let paymentsRemoved = false;
        try {
          if (paymentIds.length) {
            await removePayments(paymentIds);
            paymentsRemoved = true;
          }
          if (expenseIds.length) await removeExpenses(expenseIds);
          this.selected = [];
        } catch (err) {
          const reason = errorOf(err).message;
          if (paymentsRemoved) {
            this.selected = this.selectedExpenses.map((r) => r.key);
            this.bulkError = `${plural(paymentIds.length, 'payment')} removed; ${plural(expenseIds.length, 'expense')} kept: ${reason}`;
          } else {
            this.bulkError = `Nothing was removed: ${reason}`;
          }
        } finally {
          this.removing = false;
          this.confirmingRemove = false;
          this.changed();
        }
      },
      // Create invoice acts only when every selected row is Paid work money
      // in; the server is still the rule (it refuses any other category, and
      // a payment already invoiced).
      async createInvoice() {
        this.creating = true;
        this.createError = '';
        try {
          // In the order ze selected them: the draft's lines follow it.
          const ids = this.selected.filter((key) => key.startsWith('p')).map((key) => Number(key.slice(1)));
          const detail = await createDraft(ids);
          this.selected = [];
          this.$emit('open-invoice', detail.invoice.id);
          this.changed();
        } catch (err) {
          this.createError = errorOf(err).message;
        } finally {
          this.creating = false;
        }
      },
      // The ticked payments, in the order ze ticked them; the view drafts one
      // invoice each and opens the review.
      // Keeps `barHeight` equal to the bar's rendered height while it shows.
      watchBar(shown) {
        if (this.barObserver) {
          this.barObserver.disconnect();
          this.barObserver = null;
        }
        if (!shown) {
          this.barHeight = 0;
          return;
        }
        this.$nextTick(() => {
          const bar = this.$refs.selectionBar;
          const el = bar && (bar.$el || bar);
          if (!el || !el.getBoundingClientRect) return;
          const measure = () => {
            this.barHeight = Math.ceil(el.getBoundingClientRect().height);
          };
          measure();
          if (typeof ResizeObserver !== 'undefined') {
            this.barObserver = new ResizeObserver(measure);
            this.barObserver.observe(el);
          }
        });
      },
      generateSelected() {
        const ids = this.selected.filter((key) => key.startsWith('p')).map((key) => Number(key.slice(1)));
        if (!ids.length) return;
        this.generatingRow = null;
        this.$emit('generate', ids);
      },
      // A row "Generate invoice" is offered on: money in, marked Paid work,
      // on no invoice. The server stays the rule; a row it would refuse has
      // no button rather than a dead one.
      canGenerateRow(row) {
        const p = row.payment;
        return Boolean(p) && row.direction === 'in' && p.category === 'paid_work' && !p.invoice && !this.isPayPalTransferIntoN26(p);
      },
      // One row's invoice, straight into the review at 1 / 1. The ticks on
      // other rows are left as they are.
      generateRow(payment) {
        this.generatingRow = payment.id;
        this.$emit('generate', [payment.id]);
      },
      async patch(row, change) {
        this.rowError = '';
        this.saving = new Set([...this.saving, `p${row.id}`]);
        try {
          await patchPayment(row.id, change);
          this.changed();
        } catch (err) {
          // The server refused (for example a payment already on an issued
          // invoice); the parent's reload puts the select back to the truth.
          this.rowError = errorOf(err).message;
          this.changed();
        } finally {
          const next = new Set(this.saving);
          next.delete(`p${row.id}`);
          this.saving = next;
        }
      },
    },
  };
</script>

<style scoped>
  /* Layout per the #8399 spec (§3.114): on a phone the panel reads actions →
     filters → list, every control full width at the page edge; wide, the
     actions sit right and the filter left on one row. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The head row is the container the ways in measure themselves against
     (design_agent c61923 on system_3 #9942): .ways-in is sized by its own
     buttons, so it cannot be its own container; the full-width head can. */
  .panel-head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-md);
    container: ways-in / inline-size;
  }

  /* The ways-in wrapper (#11019-A2). At 640px and up it is a plain div that
     must not exist for layout: .ways-in stays the head row's flex item, as
     the container states below assume. */
  div.ways-in-fold {
    display: contents;
  }

  /* Below 640px it is the "Add or import" disclosure: a full-width
     secondary-button skin on the global .fold-summary, which gives the 44px
     height and the caret that turns when open (§3.41, Design ack c69874
     item 1). */
  details.ways-in-fold {
    width: 100%;
  }

  .ways-in-fold__summary {
    justify-content: center;
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    color: var(--text-body);
    font-weight: var(--font-weight-medium);
  }

  .ways-in-fold__summary:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary-hover);
  }

  .ways-in-fold__summary:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  details[open] > .ways-in-fold__summary {
    margin-bottom: var(--space-xs);
  }

  /* The one-row state never wraps: the container query below guarantees its
     780px, and WebKit's subpixel sum wraps the fourth button at exactly
     780px if wrapping is allowed (measured on system_3 #10627). */
  .ways-in {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  /* Three states, keyed on the head row's width, never the viewport (design_agent
     c66159 on system_3 #10627, refining c61923 for four buttons; §3.135
     Decisions 1 and 2). One row when the four fit: 202 + 202 + 178 + 162 +
     3 × 12 = 780px = 48.75rem. Below that, a 2×2 of equal columns, the pairs
     by hand then from a file, in DOM order: two columns as wide as the widest
     button plus the gap, 202 + 12 + 202 = 416px = 26rem. Below 26rem all four
     stack full width, as on a phone. In rem, so it moves with zir text size;
     the spec sweeps it and fails on any partial row. */
  @container ways-in (width < 48.75rem) {
    .ways-in {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
    }

    .ways-in .block-on-phone {
      width: 100%;
    }
  }

  @container ways-in (width < 26rem) {
    .ways-in {
      grid-template-columns: 1fr;
      /* The stacked state alone takes an 8px gap, so the first payment card
         stays on a 390×844 phone's first screen with four ways in
         (design_agent c66182 on system_3 #10627). One row and the 2×2 keep
         12px. */
      gap: var(--space-xs);
    }
  }

  .manual-line {
    margin-top: var(--space-2xs);
  }

  .delete-reason {
    margin-top: var(--space-2xs);
    font-size: var(--text-sm);
  }

  /* The ghost button's own padding would indent its label; pull it back so
     "Delete" lines up with the text above it. */
  .manual-delete {
    align-self: flex-start;
    margin-top: var(--space-2xs);
    margin-left: calc(-1 * var(--space-sm));
  }

  .upload__input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .nowrap {
    white-space: nowrap;
  }

  .date-order {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .date-order p {
    margin: 0;
  }

  .date-order__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .removed-show {
    align-self: flex-start;
    margin-top: var(--space-sm);
  }

  /* The import line's "restore it on Transactions": a link in the dark
     card's own ink (§3.18, §3.121), opening the removed view (D14). */
  .summary__link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-on-dark);
    text-decoration: underline;
    cursor: pointer;
  }

  /* AspCard is dark in both themes; set the ink here (§3.18). */
  .summary {
    margin-bottom: var(--space-md);
    color: var(--text-on-dark);
  }

  .summary__line {
    margin: 0;
  }

  /* The card's one action, on its own line under the sentence. */
  .summary__actions {
    margin: var(--space-sm) 0 0;
  }

  .summary__reasons {
    margin: var(--space-xs) 0 0;
    padding-left: var(--space-lg);
  }

  /* Filter left, actions right. If the actions cannot sit beside the
     filter, they wrap below it as one unit, right-aligned; the two controls
     never split (design_agent c60951, placement). */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
  }

  /* The direction strip, then the category select (§3.143 Decision 3). */
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .filter {
    width: 16rem;
  }

  /* A long category ("Out · materials and supplies") ends in an ellipsis in
     the trigger; the open panel shows it whole. */
  .filter :deep(.select__trigger) {
    min-width: 0;
  }

  .filter :deep(.select__value) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* AspSelect forwards a class to its trigger, not its root, so a wrapper
     makes it fill the row. */
  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  /* In a table cell the select fills the cell instead of its own 10rem
     minimum, which with the cell padding overflowed every select column by
     ~12px and pushed the last one out of the table's box (#8407). A value too
     long for the cell ends in an ellipsis; its title and the open panel show
     it whole. */
  .cell-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .cell-select :deep(.select__trigger) {
    min-width: 0;
    padding: 0 var(--space-xs);
    gap: var(--space-2xs);
  }

  .cell-select :deep(.select__value) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .paid-work-reason {
    display: block;
    margin-top: var(--space-2xs);
    font-size: var(--text-sm);
  }

  .create {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
  }

  .create__actions {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  /* Wide enough for its longest label on one line (operator c61550: no
     wrapping in these buttons, system_3 #9968): "Set category of selected
     payments" measured 281px at the desktop text size and 314px below 768px,
     where option text is --text-base, and today's "… selected rows" is
     shorter. A fixed width in rem fits both, so picking rows does not shift
     the row and it grows with zir text size. */
  .set-category {
    width: 20rem;
  }

  /* Keyed on the toolbar's width, never the viewport, like the ways in: the
     sidebar at 768 leaves the panel 504px (system_3 #10631). One row while
     the widest state fits: Set category 320 + the armed "Remove 12 rows" ~130
     + "Create invoice from 12 payments" ~230 + 2 × 12 = 704px = 44rem.
     Below that, Set category takes its own full-width row and Remove and
     Create invoice sit under it on the right, so the row never scrolls
     sideways and the primary stays rightmost. */
  .toolbar {
    container: selection-bar / inline-size;
  }

  @container selection-bar (width < 44rem) {
    .create {
      width: 100%;
    }

    .create__actions {
      flex-wrap: wrap;
      justify-content: flex-end;
      width: 100%;
    }

    .set-category {
      width: 100%;
    }
  }

  /* Below 640px: the selection's actions as a bar pinned to the bottom of
     the screen (§3.157 Decision 2, system_3 #11371). On the card surface with
     its own ink, a top border, and room for the phone's home indicator. It
     is teleported to <body>, so these rules reach it by its class alone. */
  .selection-bar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding-bottom: calc(var(--space-sm) + env(safe-area-inset-bottom));
  }

  /* AspCard draws a border and rounded corners all round; pinned to the
     screen's bottom the bar has a top edge only. Its own class twice, so
     these win over the card's without !important. */
  .selection-bar.selection-bar {
    border-width: 1px 0 0;
    border-radius: 0;
  }

  /* Two rows of controls (ruling c71227 on system_3 #11019). Row 1: "Set
     category of {n} selected" takes the room, Remove sits beside it at its
     own width. Row 2: a lead line, then the pair in two equal columns, the
     primary on the right. */
  .selection-bar .create__actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    gap: var(--space-xs);
  }

  .selection-bar .set-category {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
  }

  .selection-bar .block-on-phone {
    width: auto;
  }

  .selection-bar .bar-remove {
    flex: 0 0 auto;
  }

  /* Armed, Remove has the row to itself. */
  .selection-bar .bar-remove:first-child {
    flex: 1 1 100%;
  }

  .selection-bar .bar-lead {
    flex: 0 0 100%;
    margin: 0;
    font-size: var(--text-sm);
  }

  .selection-bar .bar-pair {
    flex: 1 1 0;
    min-width: 0;
  }

  /* One row ticked: the primary alone, at full width on its own row. */
  .selection-bar .bar-remove + .bar-pair {
    flex: 1 1 100%;
  }

  .selection-bar .create__hint,
  .selection-bar__error {
    margin: 0;
    text-align: left;
  }

  /* The invisible checkbox on an issued invoice's row: its box keeps the
     gutter; it is neither seen, focused nor announced. */
  .select-gutter {
    visibility: hidden;
  }

  .select-all {
    margin-bottom: var(--space-sm);
  }

  /* §3.145: one fold per month. The layout is fixed and every column has a
     width, so the columns line up from one month's table to the next. */
  .ledger-group__summary {
    font-weight: 600;
  }

  .ledger-group > :deep(*:not(summary)) {
    margin-top: var(--space-xs);
  }

  .ledger-group :deep(table) {
    table-layout: fixed;
    width: 100%;
  }

  .summary__where {
    margin: var(--space-xs) 0 0;
  }

  .create__hint {
    margin: var(--space-2xs) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: right;
  }

  /* Payer-written text may break anywhere, so a long PayPal email narrows its
     column instead of pushing the table past its box (#8407). */
  .sender {
    display: block;
    overflow-wrap: anywhere;
  }

  .muted {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .note {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .note--cell {
    display: block;
    margin-top: var(--space-2xs);
  }

  /* The client under who and what, on its own line (system_3 #11506). */
  .client-line {
    display: block;
    margin-top: var(--space-2xs);
    font-size: var(--text-sm);
  }

  /* The card's one button sits at the card's start, under its text. */
  .card-generate {
    align-self: flex-start;
    margin-top: var(--space-xs);
  }

  .error {
    color: var(--feedback-error);
    margin: 0 0 var(--space-sm);
  }

  .payment-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .payment-card {
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* A payment card's body opens its edit dialog (§3.143 Decision 5). */
  .payment-card--tap {
    cursor: pointer;
  }

  .payment-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .payment-card__who {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }

  .amount {
    font-variant-numeric: tabular-nums;
  }

  /* §3.140 Decision 2: money in in body ink, money out in the error text red
     with a minus sign, the bookkeeping convention, not an alarm. */
  .in-amount {
    color: var(--text-body);
  }

  .out-amount {
    color: var(--feedback-error-text);
  }

  .invoice-line {
    margin-top: var(--space-2xs);
  }

  /* The phone card's "{category} · {client}" (#11019-A4). It wraps between
     the two phrases, never inside the category's joined separator. */
  .category-line {
    overflow-wrap: anywhere;
  }

  /* "Uncategorised" decides "does it still need an invoice?", so it takes
     the card's ink while the rest of the line stays muted (c69874 item 5).
     The card paints no background and inherits the page's ink (§3.18), so
     "card ink" is the body ink its amount already uses, in both themes. */
  .category-line__open {
    color: var(--text-body);
  }

  @media (max-width: 640px) {
    .panel-head,
    .toolbar,
    .ways-in {
      flex-direction: column;
      align-items: stretch;
    }

    /* 12px, not 16px, under "Add or import": one of the four gaps above the
       list that §3.157's budget trims on a phone (design_agent c71509 on
       system_3 #11019, built as #11576). */
    .panel-head {
      margin-bottom: var(--space-sm);
    }

    .filter,
    .create,
    .set-category {
      width: 100%;
    }

    /* On a phone the direction strip and the category select share one row,
       so the first card stays on a 390×844 first screen (design_agent c66182
       on system_3 #10627). */
    .filters {
      flex-wrap: nowrap;
    }

    .filters .filter {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
    }

    .create {
      align-items: stretch;
      margin-left: 0;
    }

    .create__actions {
      flex-direction: column;
      align-items: stretch;
    }

    .create__hint {
      text-align: left;
    }

    .block-on-phone,
    .date-order__actions :deep(button) {
      width: 100%;
    }

    .date-order__actions {
      flex-direction: column;
    }

    /* On a phone the three gaps between the filters and the list are 4px, so
       the first month line ends on the first screen at 390×844 and is never
       cut through its text (design_agent c68157 on system_3 #10636, the note
       under §3.145 Decision 4). Above 640px they stay 12px. */
    .toolbar {
      gap: var(--space-2xs);
      margin-bottom: var(--space-2xs);
    }

    .select-all {
      margin-bottom: var(--space-2xs);
    }
  }
</style>
