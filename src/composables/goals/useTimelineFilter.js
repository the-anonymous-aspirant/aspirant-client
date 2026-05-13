import { ref, computed } from 'vue';

export function useTimelineFilter(nodes) {
  const period = ref('month');
  const customStart = ref('');
  const customEnd = ref('');
  const mode = ref('combined');
  const active = ref(false);

  function getISOWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }

  function getPeriodRange() {
    if (period.value === 'custom') {
      if (!customStart.value || !customEnd.value) return null;
      return {
        start: new Date(customStart.value),
        end: new Date(customEnd.value + 'T23:59:59'),
      };
    }

    const now = new Date();
    let start, end;

    switch (period.value) {
      case 'day':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'week': {
        const range = getISOWeekRange(now);
        start = range.start;
        end = range.end;
        end.setHours(23, 59, 59);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
        break;
      }
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        return null;
    }

    return { start, end };
  }

  function nodeMatchesFilter(node) {
    const range = getPeriodRange();
    if (!range) return true;

    const plannedStart = node.planned_start ? new Date(node.planned_start) : null;
    const plannedEnd = node.planned_end ? new Date(node.planned_end) : null;
    const completedAt = node.completed_at ? new Date(node.completed_at) : null;

    const plannedOverlaps = plannedStart && plannedEnd
      ? plannedStart <= range.end && plannedEnd >= range.start
      : plannedStart
        ? plannedStart >= range.start && plannedStart <= range.end
        : plannedEnd
          ? plannedEnd >= range.start && plannedEnd <= range.end
          : false;

    const achievedInRange = completedAt
      ? completedAt >= range.start && completedAt <= range.end
      : false;

    switch (mode.value) {
      case 'planned':
        return plannedOverlaps;
      case 'achieved':
        return achievedInRange;
      case 'combined':
      default:
        return plannedOverlaps || achievedInRange;
    }
  }

  const dimmedNodeIds = computed(() => {
    if (!active.value) return new Set();
    const dimmed = new Set();
    for (const node of nodes.value) {
      if (!nodeMatchesFilter(node)) {
        dimmed.add(node.id);
      }
    }
    return dimmed;
  });

  function apply() {
    active.value = true;
  }

  function clear() {
    active.value = false;
  }

  return {
    period,
    customStart,
    customEnd,
    mode,
    active,
    dimmedNodeIds,
    apply,
    clear,
  };
}
