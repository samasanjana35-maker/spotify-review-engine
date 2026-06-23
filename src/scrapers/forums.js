const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const FORUM_URL =
  'https://community.spotify.com/t5/forums/searchpage/tab/message?q=music+discovery+recommendations&search_type=thread&solved=all&sort_by=post_date&collapse_discussion=true';

function parseDate(dateText) {
  if (!dateText) return null;

  const parsed = new Date(dateText.trim());
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function extractThreadId(url) {
  if (!url) return null;
  const match = url.match(/\/td-p\/(\d+)/) || url.match(/\/m-p\/(\d+)/);
  return match ? match[1] : null;
}

function buildExternalId(url, title, dateText) {
  const threadId = extractThreadId(url);
  if (threadId) return `forum-${threadId}`;

  const hash = crypto
    .createHash('md5')
    .update(`${title || ''}-${dateText || ''}`)
    .digest('hex');

  return `forum-${hash}`;
}

function normalizeUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `https://community.spotify.com${href}`;
}

function mapThread({ title, author, dateText, url, body }) {
  const reviewDate = parseDate(dateText) || new Date().toISOString();

  return {
    source: 'forums',
    external_id: buildExternalId(url, title, dateText),
    author: author || 'unknown',
    rating: null,
    title: title || null,
    body: (body && body.trim()) || title || '',
    url: normalizeUrl(url),
    review_date: reviewDate,
    metadata: { forum: 'spotify_community' },
  };
}

function parseForumHtml(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  const selectors = [
  '.lia-message-view-wrapper',
  '.MessageView',
  '.search-result',
  'article',
  '.lia-component-search-results .lia-message-view-display',
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const el = $(element);
      const title =
        el.find('.message-subject a, .page-link, h2 a, h3 a, .lia-link-navigation').first().text().trim() ||
        el.find('a').first().text().trim();
      const author =
        el.find('.UserName, .lia-user-name, .author, .login-bold').first().text().trim() || null;
      const dateText =
        el.find('time').attr('datetime') ||
        el.find('.DateTime, .lia-message-posted-on, .publish-date').first().text().trim() ||
        null;
      const url =
        el.find('.message-subject a, h2 a, h3 a, .lia-link-navigation').first().attr('href') ||
        el.find('a').first().attr('href') ||
        null;
      const body =
        el.find('.lia-message-body-content, .message-body, .lia-message-body, p').first().text().trim() ||
        title;

      if (!title && !body) return;

      const mapped = mapThread({ title, author, dateText, url, body });
      if (seen.has(mapped.external_id)) return;

      const reviewDate = new Date(mapped.review_date);
      if (!isWithin90Days(reviewDate)) return;

      seen.add(mapped.external_id);
      results.push(mapped);
    });

    if (results.length > 0) break;
  }

  return results;
}

async function scrapeForums() {
  try {
    const response = await axios.get(FORUM_URL, {
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 403 || response.status === 429) {
      logger.warn('Forums scraping blocked — returning empty array');
      return [];
    }

    if (response.status !== 200) {
      logger.warn(`Forums scraping returned HTTP ${response.status} — returning empty array`);
      return [];
    }

    const results = parseForumHtml(response.data);
    logger.info(`forums: parsed ${results.length} threads from Spotify Community`);
    return results;
  } catch (err) {
    if (err.response && (err.response.status === 403 || err.response.status === 429)) {
      logger.warn('Forums scraping blocked — returning empty array');
      return [];
    }

    logger.error(`forums: scraping failed — ${err.message}`);
    return [];
  }
}

module.exports = { scrapeForums };
