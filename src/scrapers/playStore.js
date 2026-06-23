const { PLAY_STORE_ID } = require('../config/constants');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const LANGUAGES = [
  'en', 'hi', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'pl', 'ru', 'ja', 'ko', 'id', 'th', 'ar',
];
const REVIEWS_PER_LANGUAGE = 200;

let gplayModule = null;

async function getGplay() {
  if (!gplayModule) {
    gplayModule = (await import('google-play-scraper')).default;
  }
  return gplayModule;
}

function mapReview(review, language) {
  return {
    source: 'play_store',
    external_id: review.id,
    author: review.userName,
    rating: review.score,
    title: null,
    body: review.text,
    url: 'https://play.google.com/store/apps/details?id=com.spotify.music',
    review_date: new Date(review.date).toISOString(),
    metadata: { language, thumbsUp: review.thumbsUp },
  };
}

async function scrapePlayStore() {
  const gplay = await getGplay();
  const results = [];
  const seen = new Set();

  for (const language of LANGUAGES) {
    try {
      const response = await gplay.reviews({
        appId: PLAY_STORE_ID,
        lang: language,
        country: 'us',
        sort: gplay.sort.NEWEST,
        num: REVIEWS_PER_LANGUAGE,
      });

      const reviews = response.data || [];

      for (const review of reviews) {
        const reviewDate = new Date(review.date);
        if (!isWithin90Days(reviewDate)) continue;
        if (!review.text || !review.id) continue;
        if (seen.has(review.id)) continue;

        seen.add(review.id);
        results.push(mapReview(review, language));
      }

      logger.info(`play_store: fetched ${reviews.length} raw reviews for language ${language}`);
    } catch (err) {
      logger.error(`play_store: failed for language ${language} — ${err.message}`);
    }
  }

  return results;
}

module.exports = { scrapePlayStore };
