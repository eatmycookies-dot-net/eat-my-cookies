import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../../utils/stats.js';
import {
  POPUP_CARD_KIND_REVIEW,
  REVIEW_PROMPT_OPPORTUNITIES,
  REVIEW_PROMPT_THRESHOLD,
  buildReviewPopupCard,
  findTriggeredReviewPromptOpportunity,
  hasMetReviewPromptInstallAge,
  hasRecentSuccessfulAction,
  milestoneCreatesPopupCard,
  normalizeReviewPromptIds,
  selectNextPendingPopupCard,
  wasReviewCtaClicked,
} from '../../utils/popup-cards.js';

describe('milestoneCreatesPopupCard()', () => {
  it('keeps the first milestone eligible for popup cards', () => {
    expect(milestoneCreatesPopupCard(MILESTONES.find((milestone) => milestone.id === 'first_action'))).toBe(true);
  });

  it('keeps the dozen milestone eligible for popup cards', () => {
    expect(milestoneCreatesPopupCard(MILESTONES.find((milestone) => milestone.id === 'dozen'))).toBe(true);
  });

  it('keeps later milestones eligible for popup cards', () => {
    expect(milestoneCreatesPopupCard(MILESTONES.find((milestone) => milestone.id === 'quarter_crunch'))).toBe(true);
  });
});

describe('hasMetReviewPromptInstallAge()', () => {
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);

  it('allows prompts when installDate is missing', () => {
    expect(hasMetReviewPromptInstallAge(null, now)).toBe(true);
  });

  it('blocks prompts before three full days have passed', () => {
    const tooRecent = new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString();
    expect(hasMetReviewPromptInstallAge(tooRecent, now)).toBe(false);
  });

  it('allows prompts after three full days have passed', () => {
    const oldEnough = new Date(now - (4 * 24 * 60 * 60 * 1000)).toISOString();
    expect(hasMetReviewPromptInstallAge(oldEnough, now)).toBe(true);
  });

  it('allows prompts exactly at the three-day boundary', () => {
    const exactBoundary = new Date(now - (3 * 24 * 60 * 60 * 1000)).toISOString();
    expect(hasMetReviewPromptInstallAge(exactBoundary, now)).toBe(true);
  });
});

describe('hasRecentSuccessfulAction()', () => {
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);

  it('blocks prompts when no last action timestamp exists', () => {
    expect(hasRecentSuccessfulAction(null, now)).toBe(false);
  });

  it('allows prompts exactly at the thirty-minute boundary', () => {
    const exactBoundary = new Date(now - (30 * 60 * 1000)).toISOString();
    expect(hasRecentSuccessfulAction(exactBoundary, now)).toBe(true);
  });

  it('blocks prompts after thirty minutes have passed', () => {
    const stale = new Date(now - (31 * 60 * 1000)).toISOString();
    expect(hasRecentSuccessfulAction(stale, now)).toBe(false);
  });
});

describe('review CTA click state', () => {
  it('treats a missing click timestamp as not clicked', () => {
    expect(wasReviewCtaClicked({ reviewPromptClickedAt: null })).toBe(false);
  });

  it('treats a stored click timestamp as clicked', () => {
    expect(wasReviewCtaClicked({ reviewPromptClickedAt: '2026-07-20T12:00:00.000Z' })).toBe(true);
  });
});

describe('normalizeReviewPromptIds()', () => {
  it('maps legacy prompt ids into the new range ids', () => {
    expect(normalizeReviewPromptIds([
      'review_after_dozen',
      'review_after_fifty',
      'review_after_two_hundred',
    ])).toEqual([
      'review_range_12_49',
      'review_range_50_99',
      'review_range_100_plus',
    ]);
  });
});

describe('selectNextPendingPopupCard()', () => {
  it('prioritizes milestone cards over pending review cards', () => {
    const reviewCard = {
      kind: POPUP_CARD_KIND_REVIEW,
      id: 'review_range_12_49',
    };
    const milestoneCard = MILESTONES.find((milestone) => milestone.id === 'dozen');

    expect(selectNextPendingPopupCard([reviewCard, milestoneCard])).toEqual({
      card: milestoneCard,
      remainingCards: [reviewCard],
    });
  });

  it('returns the first review card when only reviews are pending', () => {
    const firstReviewCard = {
      kind: POPUP_CARD_KIND_REVIEW,
      id: 'review_range_12_49',
    };
    const secondReviewCard = {
      kind: POPUP_CARD_KIND_REVIEW,
      id: 'review_range_50_99',
    };

    expect(selectNextPendingPopupCard([firstReviewCard, secondReviewCard])).toEqual({
      card: firstReviewCard,
      remainingCards: [secondReviewCard],
    });
  });

  it('returns null when nothing is pending', () => {
    expect(selectNextPendingPopupCard([])).toEqual({
      card: null,
      remainingCards: [],
    });
  });
});

describe('findTriggeredReviewPromptOpportunity()', () => {
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);
  const lastActionDate = new Date(now - (5 * 60 * 1000)).toISOString();
  const installDate = new Date(now - (4 * 24 * 60 * 60 * 1000)).toISOString();
  const baseSettings = { installDate, reviewPromptsShown: [], reviewPromptClickedAt: null };

  it('returns the 12-49 range prompt when the popup opens in that range', () => {
    const opportunity = findTriggeredReviewPromptOpportunity({
      settings: baseSettings,
      stats: {
        totalActionsCount: 12,
        sitesHandled: 3,
        lastActionDate,
        lastActionNoticeOnly: false,
      },
      now,
    });
    expect(opportunity?.id).toBe('review_range_12_49');
  });

  it('returns the 50-99 range prompt even if the earlier range was never seen', () => {
    const opportunity = findTriggeredReviewPromptOpportunity({
      settings: baseSettings,
      stats: {
        totalActionsCount: 50,
        sitesHandled: 12,
        lastActionDate,
        lastActionNoticeOnly: false,
      },
      now,
    });
    expect(opportunity?.id).toBe('review_range_50_99');
  });

  it('returns the 100+ range prompt once the user is beyond 100', () => {
    const opportunity = findTriggeredReviewPromptOpportunity({
      settings: baseSettings,
      stats: {
        totalActionsCount: 125,
        sitesHandled: 12,
        lastActionDate,
        lastActionNoticeOnly: false,
      },
      now,
    });
    expect(opportunity?.id).toBe('review_range_100_plus');
  });

  it('returns null when the current range was already seen', () => {
    expect(findTriggeredReviewPromptOpportunity({
      settings: {
        ...baseSettings,
        reviewPromptsShown: ['review_range_50_99'],
      },
      stats: {
        totalActionsCount: 50,
        sitesHandled: 12,
        lastActionDate,
        lastActionNoticeOnly: false,
      },
      now,
    })).toBeNull();
  });

  it('returns null after the review CTA was clicked', () => {
    expect(findTriggeredReviewPromptOpportunity({
      settings: {
        ...baseSettings,
        reviewPromptClickedAt: '2026-07-20T11:59:59.000Z',
      },
      stats: {
        totalActionsCount: 50,
        sitesHandled: 12,
        lastActionDate,
        lastActionNoticeOnly: false,
      },
      now,
    })).toBeNull();
  });

  it('returns null when the last action was notice-only', () => {
    expect(findTriggeredReviewPromptOpportunity({
      settings: baseSettings,
      stats: {
        totalActionsCount: 12,
        sitesHandled: 3,
        lastActionDate,
        lastActionNoticeOnly: true,
      },
      now,
    })).toBeNull();
  });

  it('matches the expected result across the full state matrix', () => {
    const staleActionDate = new Date(now - (31 * 60 * 1000)).toISOString();
    const tooRecentInstallDate = new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const legacyIds = [
      'review_after_dozen',
      'review_after_fifty',
      'review_after_two_hundred',
    ];
    const shownStates = ['absent', 'canonical', 'legacy'];
    const counts = [0, 11, 12, 49, 50, 99, 100, 250];

    const shownIdVariants = [];
    for (const first of shownStates) {
      for (const second of shownStates) {
        for (const third of shownStates) {
          shownIdVariants.push([first, second, third]);
        }
      }
    }

    const toShownIds = (states) => states.flatMap((state, index) => {
      if (state === 'absent') return [];
      return [state === 'legacy' ? legacyIds[index] : REVIEW_PROMPT_OPPORTUNITIES[index].id];
    });

    const expectedOpportunityId = ({
      count,
      reviewPromptsShown,
      clicked,
      noticeOnly,
      sitesHandled,
      installEligible,
      recentActionEligible,
    }) => {
      if (clicked || noticeOnly || sitesHandled < 3 || !installEligible || !recentActionEligible) {
        return null;
      }

      const rangeId = count >= 100
        ? REVIEW_PROMPT_OPPORTUNITIES[2].id
        : count >= 50
          ? REVIEW_PROMPT_OPPORTUNITIES[1].id
          : count >= 12
            ? REVIEW_PROMPT_OPPORTUNITIES[0].id
            : null;

      if (!rangeId) return null;

      const normalizedShownIds = new Set(normalizeReviewPromptIds(reviewPromptsShown));
      return normalizedShownIds.has(rangeId) ? null : rangeId;
    };

    for (const count of counts) {
      for (const shownState of shownIdVariants) {
        const reviewPromptsShown = toShownIds(shownState);
        for (const clicked of [false, true]) {
          for (const noticeOnly of [false, true]) {
            for (const sitesHandled of [2, 3]) {
              for (const installEligible of [false, true]) {
                for (const recentActionEligible of [false, true]) {
                  const expectedId = expectedOpportunityId({
                    count,
                    reviewPromptsShown,
                    clicked,
                    noticeOnly,
                    sitesHandled,
                    installEligible,
                    recentActionEligible,
                  });

                  const actual = findTriggeredReviewPromptOpportunity({
                    settings: {
                      installDate: installEligible ? installDate : tooRecentInstallDate,
                      reviewPromptsShown,
                      reviewPromptClickedAt: clicked ? '2026-07-20T11:59:59.000Z' : null,
                    },
                    stats: {
                      totalActionsCount: count,
                      sitesHandled,
                      lastActionDate: recentActionEligible ? lastActionDate : staleActionDate,
                      lastActionNoticeOnly: noticeOnly,
                    },
                    now,
                  });

                  expect(
                    actual?.id ?? null,
                    `count=${count}, shown=${shownState.join('/')}, clicked=${clicked}, noticeOnly=${noticeOnly}, sitesHandled=${sitesHandled}, installEligible=${installEligible}, recentActionEligible=${recentActionEligible}`,
                  ).toBe(expectedId);
                }
              }
            }
          }
        }
      }
    }
  });
});

describe('buildReviewPopupCard()', () => {
  it('creates a review card payload for the first opportunity by default', () => {
    expect(buildReviewPopupCard({ totalActionsCount: 25 })).toEqual({
      kind: POPUP_CARD_KIND_REVIEW,
      id: 'review_range_12_49',
      relatedMilestoneId: 'dozen',
      count: 25,
    });
  });

  it('creates a review card payload for a later range opportunity', () => {
    expect(buildReviewPopupCard(
      { totalActionsCount: 125 },
      REVIEW_PROMPT_OPPORTUNITIES[2],
    )).toEqual({
      kind: POPUP_CARD_KIND_REVIEW,
      id: 'review_range_100_plus',
      relatedMilestoneId: 'century',
      count: 125,
    });
  });

  it('never creates a count below the active opportunity minimum', () => {
    expect(buildReviewPopupCard({ totalActionsCount: 1 }).count).toBe(REVIEW_PROMPT_THRESHOLD);
  });

  it.each([
    [REVIEW_PROMPT_OPPORTUNITIES[0], 1, 'review_range_12_49', 'dozen', 12],
    [REVIEW_PROMPT_OPPORTUNITIES[1], 1, 'review_range_50_99', 'fifty_stack', 50],
    [REVIEW_PROMPT_OPPORTUNITIES[2], 1, 'review_range_100_plus', 'century', 100],
  ])('enforces the minimum count for %s', (opportunity, inputCount, expectedId, expectedMilestoneId, expectedCount) => {
    expect(buildReviewPopupCard({ totalActionsCount: inputCount }, opportunity)).toEqual({
      kind: POPUP_CARD_KIND_REVIEW,
      id: expectedId,
      relatedMilestoneId: expectedMilestoneId,
      count: expectedCount,
    });
  });
});
