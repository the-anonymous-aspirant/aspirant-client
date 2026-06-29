import { createRouter, createWebHistory } from 'vue-router';
import AboutView from '../views/AboutView.vue';
import HomeView from '../views/HomeView.vue';
import MessageBoardView from '../views/MessageBoardView.vue';
import ApplicationsView from '../views/applications/Applications.vue';
import QuizHubView from '../views/applications/QuizHub.vue';
import GameHubView from '../views/applications/GameHub.vue';
import GameRBGuesserView from '../views/applications/GameRBGuesser.vue';
import GameSql from '../views/applications/GameSql.vue';
import AdminView from '../views/admin/AdminView.vue';
import TrustedView from '../views/TrustedView.vue';
import LuddeAnalytics from '../views/LuddeAnalytics.vue';
import GameWordWeaverView from '../views/applications/GameWordWeaver.vue';
import EmotionalExcellenceView from '../views/applications/EmotionalExcellence.vue';
import GameFlappyDuoView from '../views/applications/GameFlappyDuo.vue';
import GameTimelineTechView from '../views/applications/GameTimelineTech.vue';
import GameTimelinePeopleView from '../views/applications/GameTimelinePeople.vue';
import GameTimelineConflictsView from '../views/applications/GameTimelineConflicts.vue';
import TransparencyMapperView from '../views/applications/TransparencyMapper.vue';
import RemarkablePdfsView from '../views/applications/RemarkablePdfs.vue';
import UserAdmin from '../views/admin/UserAdmin.vue';
import Assets from '../views/admin/Assets.vue';
import VoiceCommander from '../views/admin/VoiceCommander.vue';
import SystemHealth from '../views/admin/SystemHealth.vue';
import Remarkable from '../views/admin/Remarkable.vue';
import Finance from '../views/admin/Finance.vue';
import EasterHuntView from '../views/applications/EasterHuntView.vue';
import QrGeneratorView from '../views/applications/QrGenerator.vue';
import FilesManagerView from '../views/applications/FilesManager.vue';
import SupportView from '../views/SupportView.vue';
import ThirtyYearGiftView from '../views/trusted/ThirtyYearGift.vue';
import Translator from '../views/trusted/Translator.vue';
import Wikipedia from '../views/trusted/Wikipedia.vue';
import Goals from '../views/trusted/Goals.vue';
import GoalTreeCanvas from '../views/trusted/GoalTreeCanvas.vue';
import ValuationStatement from '../views/trusted/ValuationStatement.vue';
import PappasPushups from '../views/trusted/PappasPushups.vue';
import Advisor from '../views/admin/Advisor.vue';
import KvittoMaker from '../views/admin/tools/KvittoMaker.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/admin', component: AdminView, meta: { roles: ['Admin'] } },
  { path: '/admin/users', component: UserAdmin, meta: { roles: ['Admin'] } },
  { path: '/admin/assets', component: Assets, meta: { roles: ['Admin'] } },
  { path: '/admin/voice-commander', component: VoiceCommander, meta: { roles: ['Admin'] } },
  { path: '/admin/system-health', component: SystemHealth, meta: { roles: ['Admin'] } },
  { path: '/admin/remarkable', component: Remarkable, meta: { roles: ['Admin'] } },
  { path: '/admin/finance', component: Finance, meta: { roles: ['Admin'] } },
  { path: '/admin/advisor', component: Advisor, meta: { roles: ['Admin'] } },
  { path: '/admin/tools/kvitto', component: KvittoMaker, meta: { roles: ['Admin'] } },

  { path: '/about', component: AboutView },

  { path: '/applications', component: ApplicationsView },
  { path: '/applications/emotional-excellence', component: EmotionalExcellenceView },
  { path: '/applications/transparencymapper', component: TransparencyMapperView },
  { path: '/applications/remarkable-pdfs', component: RemarkablePdfsView },
  { path: '/applications/qr-generator', component: QrGeneratorView },

  // Quiz routes
  { path: '/applications/quizzes', component: QuizHubView },
  { path: '/quizzes', component: QuizHubView },
  { path: '/quizzes/rbguesser', component: GameRBGuesserView },
  { path: '/quizzes/sql', component: GameSql },
  { path: '/quizzes/timeline-tech', component: GameTimelineTechView },
  { path: '/quizzes/timeline-people', component: GameTimelinePeopleView },
  { path: '/quizzes/timeline-conflicts', component: GameTimelineConflictsView },

  // Game routes
  { path: '/applications/games', component: GameHubView },
  { path: '/games', component: GameHubView },
  { path: '/games/wordweaver', component: GameWordWeaverView },
  { path: '/games/flappyduo', component: GameFlappyDuoView },
  { path: '/games/easter-hunt', component: EasterHuntView, meta: { roles: ['Trusted', 'Admin'] } },

  { path: '/trusted', component: TrustedView, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/ludde-analytics', component: LuddeAnalytics, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/files', component: FilesManagerView, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/message-board', component: MessageBoardView, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/30-year-gift', component: ThirtyYearGiftView, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/translator', component: Translator, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/wikipedia', component: Wikipedia, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/goals', component: Goals, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/goals/:id', component: GoalTreeCanvas, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/valuation-statement', component: ValuationStatement, meta: { roles: ['Trusted', 'Admin'] } },
  { path: '/trusted/pappas-pushups', component: PappasPushups, meta: { roles: ['Trusted', 'Admin'] } },

  { path: '/support', component: SupportView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const requiredRoles = to.meta.roles;
  if (!requiredRoles) return true;

  const token = localStorage.getItem('user_token');
  const role = localStorage.getItem('user_role');

  if (!token || !requiredRoles.includes(role)) {
    return '/';
  }
  return true;
});

export default router;
