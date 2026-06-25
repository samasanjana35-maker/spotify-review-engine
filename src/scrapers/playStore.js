const { PLAY_STORE_ID } = require('../config/constants');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const LANGUAGES_WITH_COUNTS = [
  { lang: 'en', country: 'us', num: 400 },
  { lang: 'en', country: 'gb', num: 250 },
  { lang: 'en', country: 'au', num: 150 },
  { lang: 'en', country: 'ca', num: 150 },
  { lang: 'hi', country: 'in', num: 100 },
  { lang: 'pt', country: 'br', num: 100 },
  { lang: 'es', country: 'mx', num: 100 },
  { lang: 'de', country: 'de', num: 100 },
  { lang: 'fr', country: 'fr', num: 100 },
  { lang: 'it', country: 'it', num: 100 },
  { lang: 'nl', country: 'nl', num: 100 },
  { lang: 'pl', country: 'pl', num: 100 },
  { lang: 'ru', country: 'ru', num: 100 },
  { lang: 'ja', country: 'jp', num: 100 },
  { lang: 'ko', country: 'kr', num: 100 },
  { lang: 'id', country: 'id', num: 100 },
];

let gplayModule = null;

async function getGplay() {
  if (!gplayModule) {
    gplayModule = (await import('google-play-scraper')).default;
  }
  return gplayModule;
}

function mapReview(review, language, country) {
  return {
    source: 'play_store',
    external_id: review.id,
    author: review.userName,
    rating: review.score,
    title: null,
    body: review.text,
    url: 'https://play.google.com/store/apps/details?id=com.spotify.music',
    review_date: new Date(review.date).toISOString(),
    metadata: { language, country, thumbsUp: review.thumbsUp },
  };
}

async function scrapePlayStore() {
  const gplay = await getGplay();
  const results = [];
  const seen = new Set();

  for (const entry of LANGUAGES_WITH_COUNTS) {
    const passes = [
      { sort: gplay.sort.NEWEST, num: entry.num, sortLabel: 'NEWEST' },
    ];

    if (entry.lang === 'en') {
      passes.push({ sort: gplay.sort.HELPFULNESS, num: 200, sortLabel: 'HELPFULNESS' });
    }

    for (const pass of passes) {
      try {
        const response = await gplay.reviews({
          appId: PLAY_STORE_ID,
          lang: entry.lang,
          country: entry.country,
          sort: pass.sort,
          num: pass.num,
        });

        const reviews = response.data || [];

        for (const review of reviews) {
          const reviewDate = new Date(review.date);
          if (!isWithin90Days(reviewDate)) continue;
          if (!review.text || !review.id) continue;
          if (seen.has(review.id)) continue;

          seen.add(review.id);
          results.push(mapReview(review, entry.lang, entry.country));
        }

        logger.info(
          `play_store: fetched ${reviews.length} raw reviews for language ${entry.lang}, country ${entry.country}, sort ${pass.sortLabel}`
        );
      } catch (err) {
        logger.error(
          `play_store: failed for language ${entry.lang}, country ${entry.country}, sort ${pass.sortLabel} — ${err.message}`
        );
      }
    }
  }

  return results;
}

module.exports = { scrapePlayStore };
