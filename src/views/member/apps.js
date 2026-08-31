// The Member area's app roster (#4184) — the ONE definition of the
// shared/personal split, consumed by both the Member index page
// (views/MemberView.vue) and the sidebar (components/sidebar/Sidebar.vue) so the
// two cannot drift. The operator ratified this classification verbatim on #3617;
// a hardcoded list is the sanctioned shape here (a per-app `scope` metadata
// field was explicitly ruled out of scope for ~12 apps).
//
// `route` is the path suffix under `/member/<section>/`; `icon` is an
// asset-manager key; `person` (personal apps only) is the human note on the
// intended user and stays out of the UI (#4198: the operator asked that user
// annotations not appear on cards or in the sidebar); `owner` is the machine
// key — the aspirant username the app belongs to.
//
// #4331 changed what the personal group MEANS. It was documented as "an IA
// grouping, not a permission"; the operator reported that Robert, logged in on
// /member, saw all five personal apps when he should see only his own. Personal
// is now a visibility boundary: `visiblePersonalApps()` below is what the index
// renders.
//
// `owner` is not invented here — three of the five are executable facts in
// `aspirant-server` `server/routes.go`, where the owner gate is
// `handlers.ValidateUserOrAdmin(<const>)`:
//   jobsOwnerUsername    = "vinoly"  (routes.go:19, gate at :245-246)
//   pushupsOwnerUsername = "robert"  (routes.go:25, gate at :235-237)
//   luddeOwnerUsername   = "jenny"   (routes.go:33, gate at :198-201)
// Värdeutlåtande has no username gate (per-user scoped inside the commander
// service by `owner_user_id`) and Den Stökiga Väggen has no server surface at
// all; both are `jenny` by the operator's #3617 rulings.
//
// THIS FILTER IS NOT ACCESS CONTROL. `user_name` comes from localStorage, which
// the user can edit; the boundary that matters is the server gate above, which
// 403s a non-owner whatever the client renders. What the filter removes is the
// visibility leak — cards advertising other people's apps — not the data.

export const SHARED_APPS = [
  { title: 'Files', description: 'Upload, download, and share files.', route: 'files', icon: 'home_icon' },
  { title: 'Message Board', description: 'Leave messages for the crew.', route: 'message-board', icon: 'message_board_icon' },
  { title: 'Translator', description: 'Translate text between languages', route: 'translator', icon: 'home_icon' },
  { title: 'Wikipedia', description: 'Browse the English Wikipedia offline', route: 'wikipedia', icon: 'home_icon' },
  { title: 'Goal Trees', description: 'Plan and track your goals', route: 'goals', icon: 'home_icon' },
  { title: 'Remarkable PDFs', description: 'Generate PDFs for your Remarkable tablet', route: 'remarkable-pdfs', icon: 'home_icon' },
  { title: 'Scratchpad', description: 'A personal note that syncs live across your devices', route: 'scratchpad', icon: 'home_icon' },
  { title: 'Constellations', description: 'A shared relationship-graph board for the card game', route: 'constellations', icon: 'home_icon' },
];

export const PERSONAL_APPS = [
  { title: 'Ludde Meal Tracker', description: "Track Ludde's meals. Bonus analytics included.", route: 'ludde-analytics', icon: 'ludde_meal_tracker_icon', person: 'sister (Ludde)', owner: 'jenny' },
  { title: 'Den Stökiga Väggen', description: 'Om bara någon kunde bringa ordning i kaoset...', route: '30-year-gift', icon: '30year_gift_icon', person: 'sister Jenny', owner: 'jenny' },
  { title: 'Värdeutlåtande', description: 'Fyll i värdeutlåtanden från PDF-underlag', route: 'valuation-statement', icon: 'home_icon', person: 'sister (värdering)', owner: 'jenny' },
  { title: 'Pappas pushups', description: '60 dagars utmaning — 1000 armhävningar', route: 'pappas-pushups', icon: 'home_icon', person: 'father', owner: 'robert' },
  { title: 'Jobs', description: 'Berlin part-time English-job feed across scraped boards', route: 'jobs', icon: 'home_icon', person: 'Viktor', owner: 'vinoly' },
];

// The personal cards one identity may see. Admin sees the whole estate, which
// mirrors the server's `ValidateUserOrAdmin` — the owner OR an admin passes.
// Everyone else sees the apps they own, which is usually one and sometimes
// none (a member with no personal app gets no Personal section at all).
//
// Reads the identity the app already stores at login (`Login.vue` writes
// `user_name` / `user_role` to localStorage; FilesManager, EasterHunt and
// GameWordWeaver read them the same way), so this adds no request.
export function visiblePersonalApps(username, role) {
  if ((role || '').toLowerCase() === 'admin') return PERSONAL_APPS;
  if (!username) return [];
  return PERSONAL_APPS.filter((app) => app.owner === username);
}
