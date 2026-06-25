const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const BASE = 'https://community.spotify.com';

const BOARDS = [
  { id: 'music', label: 'Music' },
  { id: 'content', label: 'Content Questions' },
  { id: 'closed-ideas', label: 'Closed Ideas' },
];

const SEARCH_TERMS = [
  'discovery recommendations algorithm',
  'same songs repeat shuffle',
  'playlist suggestions explore',
  'discover weekly radio new music',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SpotifyRadar/1.0)',
  Accept: 'application/json, text/html, */*',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildExternalId(url, title, dateText) {
  const match = url && (url.match(/\/td-p\/(\d+)/) || url.match(/\/m-p\/(\d+)/));
  if (match) return 'forum-' + match[1];
  const hash = crypto.createHash('md5').update((title || '') + (dateText || '')).digest('hex').slice(0, 12);
  return 'forum-' + hash;
}

function normalizeUrl(href) {
  if (!href) return null;
  return href.startsWith('http') ? href : BASE + href;
}

function mapPost({ title, author, dateText, url, body, kudos, replies }) {
  const reviewDate = dateText ? new Date(dateText) : new Date();
  const safeDate = isNaN(reviewDate.getTime()) ? new Date() : reviewDate;
  return {
    source: 'forums',
    external_id: buildExternalId(url, title, dateText),
    author: author || 'unknown',
    rating: null,
    title: title || null,
    body: (body && body.trim()) || title || '',
    url: normalizeUrl(url),
    review_date: safeDate.toISOString(),
    metadata: { forum: 'spotify_community', kudos: kudos || 0, replies: replies || 0 },
  };
}

async function fetchBoardRss(boardId) {
  const url = BASE + '/t5/' + boardId + '/rss_board/board-id/' + boardId;
  try {
    const res = await axios.get(url, {
      headers: { ...HEADERS, Accept: 'application/atom+xml, text/xml, */*' },
      timeout: 20000,
      validateStatus: (s) => s < 500,
    });
    if (res.status !== 200) return [];
    const $ = cheerio.load(res.data, { xmlMode: true });
    const posts = [];
    $('entry').each((_, el) => {
      const entry = $(el);
      const title = entry.find('title').text().trim();
      const link = entry.find('link').attr('href') || entry.find('link').text().trim();
      const updated = entry.find('updated').text() || entry.find('published').text();
      const author = entry.find('author name').text().trim();
      const body = cheerio.load(entry.find('content, summary').text() || '').text().trim() || title;
      if (!title && !body) return;
      posts.push(mapPost({ title, author, dateText: updated, url: link, body, kudos: 0, replies: 0 }));
    });
    logger.info('forums: RSS board=' + boardId + ' -> ' + posts.length + ' posts');
    return posts;
  } catch (err) {
    logger.warn('forums: RSS failed for board=' + boardId + ' - ' + err.message);
    return [];
  }
}

async function fetchSearchPage() {
  const url = BASE + '/t5/forums/searchpage/tab/message?q=music+discovery+recommendations&search_type=thread&solved=all&sort_by=kudos&collapse_discussion=true';
  try {
    const res = await axios.get(url, {
      headers: HEADERS,
      timeout: 25000,
      validateStatus: (s) => s < 500,
    });
    if (res.status !== 200) return [];
    const $ = cheerio.load(res.data);
    const results = [];
    const selectors = ['.lia-message-view-wrapper', '.MessageView', '.search-result', 'article'];
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const el = $(element);
        const title = el.find('.message-subject a, h2 a, h3 a').first().text().trim() || el.find('a').first().text().trim();
        const author = el.find('.UserName, .lia-user-name, .author').first().text().trim() || null;
        const dateText = el.find('time').attr('datetime') || el.find('.DateTime, .lia-message-posted-on').first().text().trim() || null;
        const url = el.find('.message-subject a, h2 a, h3 a').first().attr('href') || el.find('a').first().attr('href') || null;
        const body = el.find('.lia-message-body-content, .message-body, p').first().text().trim() || title;
        if (!title && !body) return;
        results.push(mapPost({ title, author, dateText, url, body, kudos: 0, replies: 0 }));
      });
      if (results.length > 0) break;
    }
    logger.info('forums: search HTML -> ' + results.length + ' posts');
    return results;
  } catch (err) {
    logger.warn('forums: search page failed - ' + err.message);
    return [];
  }
}

async function scrapeForums() {
  const seen = new Set();
  const all = [];

  for (const board of BOARDS) {
    const posts = await fetchBoardRss(board.id);
    for (const post of posts) {
      if (seen.has(post.external_id)) continue;
      seen.add(post.external_id);
      all.push(post);
    }
    await sleep(500);
  }

  if (all.length === 0) {
    logger.info('forums: RSS returned nothing - falling back to search page');
    const posts = await fetchSearchPage();
    for (const post of posts) {
      if (seen.has(post.external_id)) continue;
      seen.add(post.external_id);
      all.push(post);
    }
  }

  const recent = all.filter((post) => isWithin90Days(new Date(post.review_date)));

  recent.sort((a, b) => {
    const aK = a.metadata?.kudos || 0;
    const bK = b.metadata?.kudos || 0;
    if (aK >= 10 && bK < 10) return -1;
    if (bK >= 10 && aK < 10) return 1;
    return new Date(b.review_date) - new Date(a.review_date);
  });

  logger.info('forums: ' + all.length + ' total -> ' + recent.length + ' within 90 days');
  return recent;
}

module.exports = { scrapeForums };
