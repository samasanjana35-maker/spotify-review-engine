const axios = require('axios');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');
 
// Tighter queries — each one targets a specific discovery/recommendation pain point
// so Bluesky pre-filters before we even apply matchesRequiredPhrase
const SEARCH_QUERIES = [
  'spotify discover weekly broken',
  'spotify same songs repeat',
  'spotify recommendations algorithm',
  'spotify shuffle broken',
  'spotify filter bubble',
  'spotify new music discovery',
  'spotify daily mix same',
  'spotify algorithm stuck',
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
  'shuffle',
  'daily mix',
  'filter bubble',
  'discovery',
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
      let passedFilter = 0;
 
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
        passedFilter++;
      }
 
      logger.info(`bluesky: query="${query}" raw=${posts.length} passed=${passedFilter}`);
    } catch (err) {
      logger.error(`bluesky: failed for query "${query}" — ${err.message}`);
    }
  }
 
  // Log per-query pass rate to make 100% relevance visible in logs if it recurs
  logger.info(`bluesky: ${results.length} unique relevant posts within 90-day window`);
  return results;
}
 
module.exports = { scrapeBluesky };