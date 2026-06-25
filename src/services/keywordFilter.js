const { KEYWORDS } = require('../config/constants');
const logger = require('../utils/logger');
const DEBUG = process.env.FILTER_DEBUG === 'true';

// Reviews that mention a competitor but never mention Spotify are likely
// about a different platform and should be excluded.
const COMPETITOR_NAMES = [
  'apple music',
  'youtube music',
  'amazon music',
  'tidal',
  'deezer',
  'qobuz',
  'pandora',
  'soundcloud',
];

function mentionsCompetitorOnly(text) {
  const lower = text.toLowerCase();
  const mentionsSpotify = lower.includes('spotify');
  if (mentionsSpotify) return false; // mentions Spotify — keep it
  return COMPETITOR_NAMES.some((c) => lower.includes(c));
}

function findMatchedKeywords(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function filterReviews(reviewsArray) {
  const reviews = reviewsArray || [];
  const filtered = reviews.map((review) => {
    const searchable = `${review.title || ''} ${review.body || ''}`;
    const matched = findMatchedKeywords(searchable);
    let is_relevant = matched.length > 0;

    // Option 2: reject reviews that mention a competitor but never mention Spotify
    if (is_relevant && mentionsCompetitorOnly(searchable)) {
      is_relevant = false;
      if (DEBUG) {
        const excerpt = searchable.slice(0, 120).replace(/\s+/g, ' ').trim();
        logger.debug(`[FILTER REJECT - COMPETITOR ONLY] source=${review.source} excerpt="${excerpt}"`);
      }
    }

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
