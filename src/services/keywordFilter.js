const { KEYWORDS } = require('../config/constants');
const logger = require('../utils/logger');
const DEBUG = process.env.FILTER_DEBUG === 'true';

function findMatchedKeywords(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function filterReviews(reviewsArray) {
  const reviews = reviewsArray || [];

  const filtered = reviews.map((review) => {
    const searchable = `${review.title || ''} ${review.body || ''}`;
    const matched = findMatchedKeywords(searchable);
    const is_relevant = matched.length > 0;

    if (!is_relevant && DEBUG) {
      const excerpt = searchable.slice(0, 120).replace(/\s+/g, ' ').trim();
      logger.debug(`[FILTER REJECT] source=${review.source} excerpt="${excerpt}"`);
    }

    return {
      ...review,
      is_relevant,
      matched_keywords: is_relevant ? matched : [],
    };
  });

  const relevant = filtered.filter((r) => r.is_relevant).length;
  const rejected = filtered.length - relevant;

  logger.info(
    `Keyword filter: ${filtered.length} reviews in → ${relevant} relevant, ${rejected} rejected`
  );

  return filtered;
}

function getFilterStats(filteredReviews) {
  const total = filteredReviews.length;
  const relevant = filteredReviews.filter((r) => r.is_relevant).length;
  const rejected = total - relevant;
  const relevanceRate = total > 0 ? Math.round((relevant / total) * 10000) / 100 : 0;

  return { total, relevant, rejected, relevanceRate };
}

module.exports = { filterReviews, getFilterStats, KEYWORDS };
