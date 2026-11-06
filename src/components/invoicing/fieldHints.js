// The "what does this field mean?" hints on the invoicing fields (operator
// c61358, her two examples set the register; system_3 #10032, wording per
// design_agent c62042). Shown by the DS AspLabelHint "?" beside each label:
// a tap or keyboard focus opens one (aspirant-design-system #10033). A hint
// never repeats a field's own always-visible hint line, and a field whose
// label already says it has none (Quantity, Amount, Method, Name, Email…).
export const FIELD_HINTS = {
  issueDate: 'The day you issue the invoice. It is set when you press Issue.',
  serviceFrom: 'The day the work was done, or the first day if it ran over several days.',
  serviceUntil: 'The last day, if the work ran over several days.',
  client: 'Who the invoice is for. Their name and address are printed on it.',
  vatRate: 'The tax added on top of the price. Usually 19.',
  description: 'What the work was. This is the line on the invoice.',
  unitPrice: 'The price for one, before tax.',
  reference: 'A number from the bank or the payer, if there is one.',
  payer: 'Who sent the money, if not the client.',
  whatFor: 'It becomes the line on the invoice.',
  steuernummer: 'Your tax number from the Finanzamt. Printed on every invoice.',
  prefix: 'The start of every invoice number.',
  nextNumber: 'The number your next invoice gets.',
};
