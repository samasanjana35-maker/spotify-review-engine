const axios = require('axios');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const SEARCH_QUERIES = [
  'spotify music', 'spotify same songs repeat', 'spotify app', 'spotify discover weekly broken',
  'spotify recommendations algorithm',
  'spotify same songs repeat',
];

const BLUESKY_ENDPOINTS = [
  'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts',
  'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts',
];

const REQUIRED_PHRASES = [
  'discover weekly',
  'same songs',
  'repeat',
  'algorithm',
  'recommendation',
  'stuck',
  'bored',
  'new music',
  'suggest',
  'playlist',
  'tired of',
  'find new',
];

function matchesRequiredPhrase(text) {
  const lower = (text || '').toLowerCase();
  return REQUIRED_PHRASES.some((phrase) => lower.includes(phrase));
}

function mapPost(post) {
  const handle = post.author?.handle;
  const postId = post.uri?.split('/').pop();

  return {
    source: 'bluesky',
    external_id: post.uri,
    author: handle,
    rating: null,
    title: null,
    body: post.record?.text,
    url: handle && postId
      ? `https://bsky.app/profile/${handle}/post/${postId}`
      : null,
    review_date: post.record?.createdAt,
    metadata: {
      likes: post.likeCount || 0,
      reposts: post.repostCount || 0,
    },
  };
}

async function fetchBlueskyQuery(query) {
  let lastError = null;

  for (const endpoint of BLUESKY_ENDPOINTS) {
    try {
      const response = await axios.get(endpoint, {
        params: { q: query, limit: 100 },
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.REDDIT_USER_AGENT,
          Referer: 'https://bsky.app/',
        },
        timeout: 30000,
      });

      return response.data?.posts || [];
    } catch (err) {
      lastError = err;
      logger.warn(`bluesky: ${endpoint} failed for "${query}" (${err.response?.status || err.message})`);
    }
  }

  throw lastError || new Error(`All Bluesky endpoints failed for query: ${query}`);
}

async function scrapeBluesky() {
  const results = [];
  const seen = new Set();

  for (const query of SEARCH_QUERIES) {
    try {
      const posts = await fetchBlueskyQuery(query);

      for (const post of posts) {
        const mapped = mapPost(post);
        const body = mapped.body?.trim();

        if (!body) continue;
        if (!matchesRequiredPhrase(body)) continue;

        const reviewDate = new Date(mapped.review_date);
        if (!isWithin90Days(reviewDate)) continue;
        if (!mapped.external_id || seen.has(mapped.external_id)) continue;

        seen.add(mapped.external_id);
        results.push(mapped);
      }

      logger.info(`bluesky: fetched ${posts.length} raw posts for query "${query}"`);
    } catch (err) {
      logger.error(`bluesky: failed for query "${query}" — ${err.message}`);
    }
  }

  const filteredResults = results.filter((post) => matchesRequiredPhrase(post.body));

  logger.info(`bluesky: ${filteredResults.length} unique posts within 90-day window`);
  return filteredResults;
}

module.exports = { scrapeBluesky };
