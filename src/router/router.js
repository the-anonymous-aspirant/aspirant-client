import { createRouter, createWebHistory } from 'vue-router';
import { clearForNavigation } from '../directives/overlayHistory';
import AboutView from '../views/AboutView.vue';
import HomeView from '../views/HomeView.vue';
import MessageBoardView from '../views/member/shared/MessageBoardView.vue';
import ApplicationsView from '../views/applications/Applications.vue';
import QuizHubView from '../views/applications/QuizHub.vue';
import GameHubView from '../views/applications/GameHub.vue';
import GameRBGuesserView from '../views/applications/GameRBGuesser.vue';
import GameSql from '../views/applications/GameSql.vue';
import AdminView from '../views/admin/AdminView.vue';
import MemberView from '../views/MemberView.vue';
import LuddeAnalytics from '../views/member/personal/LuddeAnalytics.vue';
import GameWordWeaverView from '../views/applications/GameWordWeaver.vue';
import EmotionalExcellenceView from '../views/applications/EmotionalExcellence.vue';
import GameFlappyDuoView from '../views/applications/GameFlappyDuo.vue';
import GameTimelineTechView from '../views/applications/GameTimelineTech.vue';
import GameTimelinePeopleView from '../views/applications/GameTimelinePeople.vue';
import GameTimelineConflictsView from '../views/applications/GameTimelineConflicts.vue';
import TransparencyMapperView from '../views/applications/TransparencyMapper.vue';
import RemarkablePdfsView from '../views/member/shared/RemarkablePdfs.vue';
import UserAdmin from '../views/admin/UserAdmin.vue';
import Assets from '../views/admin/Assets.vue';
import VoiceCommander from '../views/admin/VoiceCommander.vue';
import SystemHealth from '../views/admin/SystemHealth.vue';
import EasterHuntView from '../views/applications/EasterHuntView.vue';
import QrGeneratorView from '../views/applications/QrGenerator.vue';
import FilesManagerView from '../views/member/shared/FilesManager.vue';
import SupportView from '../views/SupportView.vue';
import ProfileView from '../views/ProfileView.vue';
import ThirtyYearGiftView from '../views/member/personal/ThirtyYearGift.vue';
import Translator from '../views/member/shared/Translator.vue';
import Goals from '../views/member/shared/Goals.vue';
import GoalTreeCanvas from '../views/member/shared/GoalTreeCanvas.vue';
import ValuationStatement from '../views/member/personal/ValuationStatement.vue';
import PappasPushups from '../views/member/personal/PappasPushups.vue';
import JobsView from '../views/member/personal/JobsView.vue';
import Scratchpad from '../views/member/shared/Scratchpad.vue';
import Constellations from '../views/member/shared/Constellations.vue';
import ConstellationsRoom from '../views/member/shared/ConstellationsRoom.vue';
import Advisor from '../views/admin/Advisor.vue';
import BrowserFlows from '../views/admin/BrowserFlows.vue';
import FlowDetail from '../views/admin/browser-flows/FlowDetail.vue';
import RunForensic from '../views/admin/browser-flows/RunForensic.vue';
import KvittoMaker from '../views/admin/tools/KvittoMaker.vue';
import LoginView from '../views/LoginView.vue';
import NotFound from '../views/NotFound.vue';
import { TIER, tierOf } from '../lib/tiers.js';

// Access-tier gates (epic #5113-A2/A3). The guard below reads user_role and
// admits when its tier clears the route's minTier. tierOf accepts both the tier
// names the server now sends (Member/Viewer/Admin) and the legacy names on
// pre-migration sessions, so this matches the deployed server exactly. A route
// with no minTier is public.
const MEMBER_ROLES = { minTier: TIER.member };
const VIEWER = { minTier: TIER.viewer };
const ADMIN = { minTier: TIER.admin };

const routes = [
  { path: '/', component: HomeView },
  { path: '/login', component: LoginView },
  { path: '/admin', component: AdminView, meta: ADMIN },
  { path: '/admin/users', component: UserAdmin, meta: ADMIN },
  { path: '/admin/assets', component: Assets, meta: ADMIN },
  { path: '/admin/voice-commander', component: VoiceCommander, meta: ADMIN },
  { path: '/admin/system-health', component: SystemHealth, meta: ADMIN },
  { path: '/admin/advisor', component: Advisor, meta: ADMIN },
  { path: '/admin/browser-flows', component: BrowserFlows, meta: ADMIN },
  { path: '/admin/browser-flows/:id', component: FlowDetail, meta: ADMIN },
  { path: '/admin/browser-flows/:id/runs/:run_id', component: RunForensic, meta: ADMIN },
  { path: '/admin/tools/kvitto', component: KvittoMaker, meta: ADMIN },

  { path: '/about', component: AboutView },

  { path: '/applications', component: ApplicationsView, meta: VIEWER },
  { path: '/applications/emotional-excellence', component: EmotionalExcellenceView, meta: VIEWER },
  { path: '/applications/transparencymapper', component: TransparencyMapperView, meta: VIEWER },
  { path: '/applications/qr-generator', component: QrGeneratorView, meta: VIEWER },

  // Constellations (#4587) moved from the member area onto the applications
  // page at the viewer tier (#5113-B1 / operator D2) — a signed-up viewer can
  // create/join/play. The room component is a placeholder here (#4598/B3);
  // #4601 mounts the board. Server enforces the per-room membership boundary.
  { path: '/applications/constellations', component: Constellations, meta: VIEWER },
  { path: '/applications/constellations/room/:code', component: ConstellationsRoom, meta: VIEWER },

  // Quiz routes
  { path: '/applications/quizzes', component: QuizHubView, meta: VIEWER },
  { path: '/quizzes', component: QuizHubView, meta: VIEWER },
  { path: '/quizzes/rbguesser', component: GameRBGuesserView, meta: VIEWER },
  { path: '/quizzes/sql', component: GameSql, meta: VIEWER },
  { path: '/quizzes/timeline-tech', component: GameTimelineTechView, meta: VIEWER },
  { path: '/quizzes/timeline-people', component: GameTimelinePeopleView, meta: VIEWER },
  { path: '/quizzes/timeline-conflicts', component: GameTimelineConflictsView, meta: VIEWER },

  // Game routes
  { path: '/applications/games', component: GameHubView, meta: VIEWER },
  { path: '/games', component: GameHubView, meta: VIEWER },
  { path: '/games/wordweaver', component: GameWordWeaverView, meta: VIEWER },
  { path: '/games/flappyduo', component: GameFlappyDuoView, meta: VIEWER },
  { path: '/games/easter-hunt', component: EasterHuntView, meta: MEMBER_ROLES },

  // Member area (#4184): the former /trusted area, renamed and split into a
  // Shared sub-area (logged-in, multi-person / general utilities) and a
  // Personal sub-area (apps built for one specific person). Every entry keeps
  // the member gate.
  { path: '/member', component: MemberView, meta: MEMBER_ROLES },

  // Shared
  { path: '/member/shared/files', component: FilesManagerView, meta: MEMBER_ROLES },
  { path: '/member/shared/message-board', component: MessageBoardView, meta: MEMBER_ROLES },
  { path: '/member/shared/translator', component: Translator, meta: MEMBER_ROLES },
  { path: '/member/shared/goals', component: Goals, meta: MEMBER_ROLES },
  { path: '/member/shared/goals/:id', component: GoalTreeCanvas, meta: MEMBER_ROLES },
  { path: '/member/shared/remarkable-pdfs', component: RemarkablePdfsView, meta: MEMBER_ROLES },
  { path: '/member/shared/scratchpad', component: Scratchpad, meta: MEMBER_ROLES },
  // Constellations moved to /applications/constellations (#5113-B1); redirect
  // the old member-area bookmarks, carrying the room code through.
  { path: '/member/shared/constellations', redirect: '/applications/constellations' },
  {
    path: '/member/shared/constellations/room/:code',
    redirect: (to) => `/applications/constellations/room/${to.params.code}`,
  },

  // Personal
  { path: '/member/personal/ludde-analytics', component: LuddeAnalytics, meta: MEMBER_ROLES },
  { path: '/member/personal/30-year-gift', component: ThirtyYearGiftView, meta: MEMBER_ROLES },
  { path: '/member/personal/valuation-statement', component: ValuationStatement, meta: MEMBER_ROLES },
  { path: '/member/personal/pappas-pushups', component: PappasPushups, meta: MEMBER_ROLES },
  { path: '/member/personal/jobs', component: JobsView, meta: MEMBER_ROLES },

  // Redirects for the old /trusted/* bookmarks (and remarkable-pdfs, which moved
  // out of /applications). One per moved route so existing links keep working;
  // the goals/:id redirect carries the param through.
  { path: '/trusted', redirect: '/member' },
  { path: '/trusted/ludde-analytics', redirect: '/member/personal/ludde-analytics' },
  { path: '/trusted/files', redirect: '/member/shared/files' },
  { path: '/trusted/message-board', redirect: '/member/shared/message-board' },
  { path: '/trusted/30-year-gift', redirect: '/member/personal/30-year-gift' },
  { path: '/trusted/translator', redirect: '/member/shared/translator' },
  { path: '/trusted/goals', redirect: '/member/shared/goals' },
  { path: '/trusted/goals/:id', redirect: (to) => `/member/shared/goals/${to.params.id}` },
  { path: '/trusted/valuation-statement', redirect: '/member/personal/valuation-statement' },
  { path: '/trusted/pappas-pushups', redirect: '/member/personal/pappas-pushups' },
  { path: '/trusted/jobs', redirect: '/member/personal/jobs' },
  { path: '/trusted/scratchpad', redirect: '/member/shared/scratchpad' },
  { path: '/applications/remarkable-pdfs', redirect: '/member/shared/remarkable-pdfs' },

  { path: '/support', component: SupportView },

  // Own profile — any authenticated user (the three real roles). An anonymous
  // visitor has no cached user_role and is bounced to '/' by the guard below;
  // the server enforces the real boundary on /api/profile regardless.
  { path: '/profile', component: ProfileView, meta: VIEWER },

  // Catch-all for unknown paths. Kept public (no role meta) so anonymous
  // visitors see a graceful 404 instead of being silently redirected to /.
  // The nginx layer 301s known renames before they reach Vue (see
  // default.conf); this is the safety net for typos and unmapped paths.
  { path: '/:pathMatch(.*)*', component: NotFound },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// When the route path actually changes, tear down any overlay left open across
// the navigation without unwinding history — the navigation restructures the
// history stack itself, so an overlay's history.back() here would undo it. (#4172)
router.beforeEach((to, from) => {
  if (to.path !== from.path) {
    clearForNavigation();
  }
  return true;
});

router.beforeEach((to) => {
  const minTier = to.meta.minTier;
  if (minTier == null) return true; // public route — no gate

  // Cached display state, not a credential: the session is an HttpOnly
  // cookie this script cannot read (system_3 #2564). This guard only keeps
  // the UI honest — it is trivially bypassed from devtools and always was,
  // so every gated route stays enforced server-side by the /api/ auth
  // middleware and, for the embedded surfaces, the nginx auth_request gate.
  // tierOf(null) is the blocked tier, so an anonymous visitor is bounced.
  const role = localStorage.getItem('user_role');

  if (tierOf(role) < minTier) {
    return '/';
  }
  return true;
});

export default router;
