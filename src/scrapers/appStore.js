const store = require('app-store-scraper');
const { APP_STORE_ID } = require('../config/constants');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const COUNTRIES = [
  'us', 'gb', 'in', 'au', 'ca', 'de', 'fr', 'br', 'mx', 'es',
  'it', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'ru', 'jp', 'kr',
  'sg', 'ph', 'id', 'th', 'za', 'ng', 'ar', 'co', 'cl', 'pt',
];
const PAGES_NEEDED = 5;
const MAX_PER_COUNTRY = PAGES_NEEDED * 50;

function mapReview(review, country) {
  return {
    source: 'app_store',
    external_id: String(review.id),
    author: review.userName,
    rating: review.score,
    title: review.title,
    body: review.text,
    url: 'https://apps.apple.com/app/spotify/id324684580',
    review_date: new Date(review.updated).toISOString(),
    metadata: { country, version: review.version },
  };
}

async function fetchCountryReviews(country) {
  const reviews = [];

  for (let attempt = 0; attempt < 2 && reviews.length === 0; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    for (let page = 1; page <= PAGES_NEEDED; page += 1) {
      const pageReviews = await store.reviews({
        id: APP_STORE_ID,
        country,
        page,
        sort: store.sort.RECENT,
      });

      if (!pageReviews || pageReviews.length === 0) {
        break;
      }

      reviews.push(...pageReviews.filter((review) => review.score <= 2));
    }
  }

  return reviews.filter((review) => review.score <= 2).slice(0, MAX_PER_COUNTRY);
}

async function scrapeAppStore() {
  const seen = new Set();
  const results = [];

  for (const country of COUNTRIES) {
    try {
      const reviews = await fetchCountryReviews(country);

      for (const review of reviews) {
        if (!review.text || !review.id) continue;

        const reviewDate = new Date(review.updated);
        if (!isWithin90Days(reviewDate)) continue;

        const id = String(review.id);
        if (seen.has(id)) continue;

        seen.add(id);
        results.push(mapReview(review, country));
      }

      logger.info(`app_store: fetched ${reviews.length} raw reviews for country ${country}`);
    } catch (err) {
      logger.error(`app_store: failed for country ${country} — ${err.message}`);
    }
  }

  return results;
}

module.exports = { scrapeAppStore };
