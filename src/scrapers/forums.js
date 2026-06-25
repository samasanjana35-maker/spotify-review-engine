/**
 * UPGRADE 2 (v3): Spotify Community Forum scraper
 *
 * Root-cause fixes from v2:
 * - Correct board IDs: 'music' → 'music_discussion', 'closed-ideas' → 'ideas_no', etc.
 * - Correct RSS URL: /spotify/rss/board?board.id=<id>  (confirmed from live page)
 * - Simplified LiQL: fetch recent top-level posts per board (no MATCHES filter);
 *   keyword relevance is handled downstream by keywordFilter.js
 * - Ideas boards (ideas_live, ideas_no) use RSS only — Lithium API returns 0 for idb-p boards
 * - Removed 90-day hard cut; posts with a bad/missing date default to "now" so they aren't lost
 *
 * Boards targeted:
 *   message boards (API + RSS): music_discussion, discovery_and_promo, content
 *   idea boards   (RSS only):   ideas_live, ideas_no
 */

const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const logger = require('../utils/logger');

const BASE = 'https://community.spotify.com';

// Board registry
// type 'bd-p'  → regular message board — Lithium API works
// type 'idb-p' → idea board — RSS only
const BOARDS = [
  { id: 'music_discussion',    urlName: 'Music-Discussion',   type: 'bd-p'  },
  { id: 'discovery_and_promo', urlName: 'Discovery-Promo',    type: 'bd-p'  },
  { id: 'content',             urlName: 'Content-Questions',  type: 'bd-p'  },
  { id: 'ideas_live',          urlName: 'Live-Ideas',         type: 'idb-p' },
  { id: 'ideas_no',            urlName: 'Closed-Ideas',       type: 'idb-p' },
];

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (compatible; SpotifyRadar/1.0; research tool)',
  Accept: 'application/json, application/atom+xml, text/xml, text/html, */*',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function buildExternalId(url, title, dateText) {
  // Prefer numeric post/message ID from URL
  const match = url && (url.match(/\/td-p\/(\d+)/) || url.match(/\/m-p\/(\d+)/) || url.match(/\/idi-p\/(\d+)/));
  if (match) return `forum-${match[1]}`;
  const hash = crypto
    .createHash('md5')
    .update(`${title || ''}-${dateText || ''}`)
    .digest('hex')
    .slice(0, 12);
  return `forum-${hash}`;
}

function normalizeUrl(href) {
  if (!href) return null;
  return href.startsWith('http') ? href : `${BASE}${href}`;
}

function safeDate(dateText) {
  if (!dateText) return new Date();
  const d = new Date(dateText);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function mapPost({ title, author, dateText, url, body, kudos, replies }) {
  return {
    source: 'forums',
    external_id: buildExternalId(url, title, dateText),
    author: author || 'unknown',
    rating: null,
    title: title || null,
    body: (body && body.trim()) || title || '',
    url: normalizeUrl(url),
    review_date: safeDate(dateText).toISOString(),
    metadata: {
      forum: 'spotify_community',
      kudos: kudos || 0,
      replies: replies || 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: Lithium REST API v2  (regular boards only)
// Fetches the 50 most-recent top-level posts per board.
// No MATCHES filter — keyword relevance is applied downstream.
// ---------------------------------------------------------------------------

function buildLiqlUrl(boardId, pageSize = 50) {
  const liql = `SELECT subject, body, author, post_time, kudos_weight, replies_count, view_href FROM messages WHERE board.id = '${boardId}' AND depth = 0 ORDER BY post_time DESC LIMIT ${pageSize}`;
  return `${BASE}/api/2.0/search?q=${encodeURIComponent(liql)}&restapi.response_style=view`;
}

async function fetchLithiumApi(boardId) {
  const url = buildLiqlUrl(boardId, 50);
  try {
    const res = await axios.get(url, {
      headers: REQUEST_HEADERS,
      timeout: 20000,
      validateStatus: (s) => s < 500,
    });

    if (res.status !== 200) {
      logger.warn(`forums: API ${boardId} → HTTP ${res.status}`);
      return [];
    }

    const items = res.data?.data?.items || [];
    const posts = items.map((item) => mapPost({
      title: item.subject || '',
      author: item.author?.login || item.author?.display_name || 'unknown',
      dateText: item.post_time || item.post_date,
      url: item.view_href || item.href,
      body: item.body ? cheerio.load(item.body).text().trim() : (item.subject || ''),
      kudos: item.kudos_weight || item.kudos?.sum?.weight || 0,
      replies: item.replies_count || 0,
    }));

    logger.info(`forums: API board=${boardId} → ${posts.length} posts`);
    return posts;
  } catch (err) {
    logger.warn(`forums: API failed board=${boardId} — ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Board RSS feed
// Correct URL format confirmed from live Spotify Community pages:
//   https://community.spotify.com/spotify/rss/board?board.id=<id>
// Works for both bd-p and idb-p board types.
// ---------------------------------------------------------------------------

async function fetchBoardRss(boardId) {
  const url = `${BASE}/spotify/rss/board?board.id=${boardId}`;
  try {
    const res = await axios.get(url, {
      headers: { ...REQUEST_HEADERS, Accept: 'application/atom+xml, text/xml, */*' },
      timeout: 20000,
      validateStatus: (s) => s < 500,
    });

    if (res.status !== 200) {
      logger.warn(`forums: RSS ${boardId} → HTTP ${res.status}`);
      return [];
    }

    const $ = cheerio.load(res.data, { xmlMode: true });
    const posts = [];

    $('entry, item').each((_, el) => {
      const entry = $(el);
      const title = entry.find('title').first().text().trim();
      const link =
        entry.find('link[rel="alternate"]').attr('href') ||
        entry.find('link').first().attr('href') ||
        entry.find('link').first().text().trim();
      const updated =
        entry.find('updated').text() ||
        entry.find('pubDate').text() ||
        entry.find('published').text();
      const author =
        entry.find('author name').text().trim() ||
        entry.find('dc\\:creator').text().trim() ||
        '';
      const rawBody =
        entry.find('content').text() ||
        entry.find('summary').text() ||
        entry.find('description').text() ||
        '';
      const body = cheerio.load(rawBody).text().trim() || title;

      if (!title && !body) return;
      posts.push(mapPost({ title, author, dateText: updated, url: link, body, kudos: 0, replies: 0 }));
    });

    logger.info(`forums: RSS board=${boardId} → ${posts.length} posts`);
    return posts;
  } catch (err) {
    logger.warn(`forums: RSS failed board=${boardId} — ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function scrapeForums() {
  const seen = new Set();
  const all = [];

  for (const board of BOARDS) {
    // Strategy 1: Lithium API (message boards only)
    if (board.type === 'bd-p') {
      const posts = await fetchLithiumApi(board.id);
      for (const post of posts) {
        if (seen.has(post.external_id)) continue;
        seen.add(post.external_id);
        all.push(post);
      }
      await sleep(400);
    }

    // Strategy 2: RSS (all boards — fills gaps and covers idea boards)
    const rssPosts = await fetchBoardRss(board.id);
    for (const post of rssPosts) {
      if (seen.has(post.external_id)) continue;
      seen.add(post.external_id);
      all.push(post);
    }
    await sleep(400);
  }

  // Sort: high-kudos first, then by date descending
  all.sort((a, b) => {
    const aK = a.metadata?.kudos || 0;
    const bK = b.metadata?.kudos || 0;
    if (aK !== bK) return bK - aK;
    return new Date(b.review_date) - new Date(a.review_date);
  });

  logger.info(`forums: scrapeForums complete — ${all.length} total posts`);
  return all;
}

module.exports = { scrapeForums };
