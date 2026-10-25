// system_3 #8634 / #8650: the client's mirror of the server's closed element
// prop table (aspirant-server server/data_models/cardgen_spec.go
// `elementPropRules`). It only decides which control the inspector shows for
// a prop and which kinds show it; the server's parse is the validator and its
// refusal text is shown as returned. Keep the two tables in step.

export const ELEMENT_KINDS = ['text', 'image', 'rect'];
export const ELEMENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const ALL = ['text', 'image', 'rect'];

/** Ordered: the inspector draws them in this order, grouped by `group`. */
export const SPEC_PROPS = [
  { name: 'kind', control: 'enum', options: ELEMENT_KINDS, kinds: ALL, group: 'Element' },
  { name: 'hidden', control: 'bool', kinds: ALL, group: 'Element' },
  { name: 'x_mm', control: 'number', min: -1000, max: 1000, step: 0.5, kinds: ALL, group: 'Box (mm)' },
  { name: 'y_mm', control: 'number', min: -1000, max: 1000, step: 0.5, kinds: ALL, group: 'Box (mm)' },
  { name: 'w_mm', control: 'number', min: 0, max: 1000, step: 0.5, kinds: ALL, group: 'Box (mm)' },
  { name: 'h_mm', control: 'number', min: 0, max: 1000, step: 0.5, kinds: ALL, group: 'Box (mm)' },
  { name: 'rotate_deg', control: 'number', min: -360, max: 360, step: 1, kinds: ALL, group: 'Box (mm)' },
  { name: 'z', control: 'number', min: -1000, max: 1000, step: 1, kinds: ALL, group: 'Box (mm)' },
  { name: 'opacity', control: 'number', min: 0, max: 1, step: 0.05, kinds: ALL, group: 'Box (mm)' },
  { name: 'text', control: 'text', kinds: ['text'], group: 'Text' },
  { name: 'font_asset_id', control: 'asset', assetKinds: ['font'], kinds: ['text'], group: 'Text' },
  { name: 'size_pt', control: 'number', min: 1, max: 200, step: 0.5, kinds: ['text'], group: 'Text' },
  { name: 'line_height', control: 'number', min: 0.5, max: 3, step: 0.05, kinds: ['text'], group: 'Text' },
  { name: 'letter_spacing', control: 'number', min: -5, max: 20, step: 0.1, kinds: ['text'], group: 'Text' },
  { name: 'align', control: 'enum', options: ['left', 'center', 'right'], kinds: ['text'], group: 'Text' },
  { name: 'valign', control: 'enum', options: ['top', 'middle', 'bottom'], kinds: ['text'], group: 'Text' },
  { name: 'weight', control: 'enum', options: ['normal', 'bold'], kinds: ['text'], group: 'Text' },
  { name: 'italic', control: 'bool', kinds: ['text'], group: 'Text' },
  { name: 'transform', control: 'enum', options: ['none', 'uppercase'], kinds: ['text'], group: 'Text' },
  { name: 'color', control: 'colour', kinds: ['text'], group: 'Text' },
  { name: 'asset_id', control: 'asset', assetKinds: ['image', 'svg'], kinds: ['image'], group: 'Image' },
  { name: 'fit', control: 'enum', options: ['cover', 'contain', 'stretch'], kinds: ['image'], group: 'Image' },
  { name: 'fill', control: 'colour', kinds: ['rect'], group: 'Rectangle' },
  { name: 'stroke', control: 'colour', kinds: ['rect'], group: 'Rectangle' },
  { name: 'stroke_mm', control: 'number', min: 0, max: 20, step: 0.1, kinds: ['rect'], group: 'Rectangle' },
];

export function propsForKind(kind) {
  return SPEC_PROPS.filter((p) => p.kinds.includes(kind || 'text'));
}

/** True when `value` is acceptable for the prop in the client's mirror. */
export function propValueOk(prop, value) {
  if (value == null) return false;
  switch (prop.control) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= prop.min && value <= prop.max;
    case 'enum':
      return prop.options.includes(value);
    case 'bool':
      return typeof value === 'boolean';
    case 'colour':
      return typeof value === 'string' && HEX_COLOUR_PATTERN.test(value);
    case 'asset':
      return Number.isInteger(value) && value > 0;
    case 'text':
      return typeof value === 'string' && value.length <= 2000;
    default:
      return false;
  }
}

/** Deep copy of a spec, normalised to `{size?, elements}`. */
export function cloneSpec(spec) {
  const out = { elements: {} };
  if (spec?.size) out.size = { ...spec.size };
  for (const [name, props] of Object.entries(spec?.elements || {})) out.elements[name] = { ...(props || {}) };
  return out;
}

export function specsEqual(a, b) {
  return JSON.stringify(sortedSpec(a)) === JSON.stringify(sortedSpec(b));
}

function sortedSpec(spec) {
  const c = cloneSpec(spec);
  const elements = {};
  for (const name of Object.keys(c.elements).sort()) {
    const props = {};
    for (const k of Object.keys(c.elements[name]).sort()) props[k] = c.elements[name][k];
    elements[name] = props;
  }
  return { size: c.size || null, elements };
}

/**
 * The leaf step of the server's merge, used only to preview an unsaved draft:
 * `parentResolved` is the server's resolved parent (or null), `draft` the own
 * layer. Returns a face in the resolved shape with provenance `slug` for draft
 * props. No defaults, no validation, no chain walking.
 */
export function overlayDraft(parentResolved, draft, slug) {
  const byName = new Map();
  for (const el of parentResolved?.elements || []) byName.set(el.name, { name: el.name, props: { ...el.props }, provenance: { ...el.provenance } });
  for (const [name, props] of Object.entries(draft?.elements || {})) {
    const el = byName.get(name) || { name, props: {}, provenance: {} };
    for (const [k, v] of Object.entries(props || {})) {
      el.props[k] = v;
      el.provenance[k] = slug;
    }
    byName.set(name, el);
  }
  const size = { ...(parentResolved?.size || { w_mm: 105, h_mm: 74.25, radius_mm: 0 }) };
  const sizeProvenance = { ...(parentResolved?.size_provenance || {}) };
  for (const k of ['w_mm', 'h_mm', 'radius_mm']) {
    if (draft?.size && draft.size[k] != null) {
      size[k] = draft.size[k];
      sizeProvenance[k] = slug;
    }
  }
  const elements = [...byName.values()].sort((a, b) => (a.props.z || 0) - (b.props.z || 0) || a.name.localeCompare(b.name));
  return { chain: [...(parentResolved?.chain || []), slug], size, size_provenance: sizeProvenance, elements };
}
