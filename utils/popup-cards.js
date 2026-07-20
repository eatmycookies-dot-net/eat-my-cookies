export const POPUP_CARD_KIND_REVIEW = 'review';
export const REVIEW_PROMPT_OPPORTUNITIES = [
  { id: 'review_range_12_49', relatedMilestoneId: 'dozen', minCount: 12, maxCount: 49 },
  { id: 'review_range_50_99', relatedMilestoneId: 'fifty_stack', minCount: 50, maxCount: 99 },
  { id: 'review_range_100_plus', relatedMilestoneId: 'century', minCount: 100, maxCount: null },
];
export const REVIEW_PROMPT_RELATED_MILESTONE_ID = REVIEW_PROMPT_OPPORTUNITIES[0].relatedMilestoneId;
export const REVIEW_PROMPT_THRESHOLD = REVIEW_PROMPT_OPPORTUNITIES[0].minCount;

const REVIEW_PROMPT_MIN_INSTALL_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const REVIEW_PROMPT_MIN_SITES_HANDLED = 3;
const REVIEW_PROMPT_MAX_LAST_ACTION_AGE_MS = 30 * 60 * 1000;
const LEGACY_REVIEW_PROMPT_ID_MAP = new Map([
  ['review_after_dozen', 'review_range_12_49'],
  ['review_after_fifty', 'review_range_50_99'],
  ['review_after_two_hundred', 'review_range_100_plus'],
]);

function parseTimestamp(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

export function normalizeReviewPromptIds(reviewPromptIds = []) {
  return reviewPromptIds.map((id) => LEGACY_REVIEW_PROMPT_ID_MAP.get(id) ?? id);
}

function shownReviewPromptIds(settings) {
  return normalizeReviewPromptIds(settings?.reviewPromptsShown ?? []);
}

function countMatchesOpportunity(count, opportunity) {
  const numericCount = Number(count) || 0;
  if (numericCount < opportunity.minCount) return false;
  return opportunity.maxCount == null || numericCount <= opportunity.maxCount;
}

export function popupCardKey(card) {
  if (card?.kind === POPUP_CARD_KIND_REVIEW) {
    return `review:${card.id ?? REVIEW_PROMPT_OPPORTUNITIES[0].id}`;
  }
  return `milestone:${card?.id ?? card?.threshold ?? 'unknown'}`;
}

export function selectNextPendingPopupCard(cards = []) {
  const pendingCards = Array.isArray(cards) ? cards : [];
  const milestoneIndex = pendingCards.findIndex((card) => card?.kind !== POPUP_CARD_KIND_REVIEW);
  const selectedIndex = milestoneIndex >= 0
    ? milestoneIndex
    : pendingCards.findIndex((card) => card?.kind === POPUP_CARD_KIND_REVIEW);

  if (selectedIndex < 0) {
    return {
      card: null,
      remainingCards: pendingCards,
    };
  }

  return {
    card: pendingCards[selectedIndex],
    remainingCards: pendingCards.filter((_, index) => index !== selectedIndex),
  };
}

export function milestoneCreatesPopupCard(milestone) {
  return Boolean(milestone);
}

export function hasMetReviewPromptInstallAge(installDate, now = Date.now()) {
  if (!installDate) return true;
  const timestamp = parseTimestamp(installDate);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp >= REVIEW_PROMPT_MIN_INSTALL_AGE_MS;
}

export function hasRecentSuccessfulAction(lastActionDate, now = Date.now()) {
  const timestamp = parseTimestamp(lastActionDate);
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp <= REVIEW_PROMPT_MAX_LAST_ACTION_AGE_MS;
}

export function wasReviewCtaClicked(settings) {
  return Boolean(settings?.reviewPromptClickedAt);
}

export function findTriggeredReviewPromptOpportunity({
  settings,
  stats,
  now = Date.now(),
}) {
  if (wasReviewCtaClicked(settings)) return null;
  if (stats?.lastActionNoticeOnly) return null;
  if ((stats?.sitesHandled ?? 0) < REVIEW_PROMPT_MIN_SITES_HANDLED) return null;
  if (!hasRecentSuccessfulAction(stats?.lastActionDate, now)) return null;
  if (!hasMetReviewPromptInstallAge(settings?.installDate, now)) return null;

  const totalActionsCount = Number(stats?.totalActionsCount) || 0;
  const currentOpportunity = REVIEW_PROMPT_OPPORTUNITIES.find((opportunity) => (
    countMatchesOpportunity(totalActionsCount, opportunity)
  ));

  if (!currentOpportunity) return null;

  const shownIds = new Set(shownReviewPromptIds(settings));
  if (shownIds.has(currentOpportunity.id)) return null;

  return currentOpportunity;
}

export function buildReviewPopupCard(stats, opportunity = REVIEW_PROMPT_OPPORTUNITIES[0]) {
  return {
    kind: POPUP_CARD_KIND_REVIEW,
    id: opportunity.id,
    relatedMilestoneId: opportunity.relatedMilestoneId,
    count: Math.max(Number(stats?.totalActionsCount) || 0, opportunity.minCount),
  };
}
