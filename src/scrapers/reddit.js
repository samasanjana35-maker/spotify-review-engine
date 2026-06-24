const axios = require('axios');
const cheerio = require('cheerio');
const { isWithin90Days } = require('../utils/dateUtils');
const logger = require('../utils/logger');

const SUBREDDITS = [
  'spotify', 'Music', 'WeAreTheMusicMakers', 'ListenToThis', 'ifyoulikeblank',
];

const SEARCH_QUERIES = [
  'spotify music discovery recommendations algorithm',
  'spotify same songs repeat boring stuck',
  'spotify discover weekly playlist suggestions',
];

const QUERY_TERMS = [
  ['spotify', 'discovery', 'recommend', 'algorithm', 'music'],
  ['spotify', 'same songs', 'repeat', 'bored', 'stuck'],
  ['spotify', 'discover weekly', 'playlist', 'suggest'],
];

const DELAY_MS = 2500;
const RETRY_DELAY_MS = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  return cheerio.load(html || '').text().replace(/\s+/g, ' ').trim();
}

function matchesQueryTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function mapJsonPost(post) {
  const data = post.data;
  const body = (data.selftext && data.selftext.trim()) || data.title;

  return {
    source: 'reddit',
    external_id: data.id,
    author: data.author,
    rating: null,
    title: data.title,
    body,
    url: `https://reddit.com${data.permalink}`,
    review_date: new Date(data.created_utc * 1000).toISOString(),
    metadata: {
      subreddit: data.subreddit,
      score: data.score,
      num_comments: data.num_comments,
    },
  };
}

function mapRssEntry(entry, subreddit) {
  const id = entry.find('id').text().replace('t3_', '').trim();
  const title = entry.find('title').text().trim();
  const content = stripHtml(entry.find('content').text());
  const author = entry.find('author name').text().replace('/u/', '').trim();
  const link = entry.find('link').attr('href');
  const updated = entry.find('updated').text() || entry.find('published').text();
  const body = content || title;

  return {
    source: 'reddit',
    external_id: id,
    author,
    rating: null,
    title,
    body,
    url: link,
    review_date: new Date(updated).toISOString(),
    metadata: {
      subreddit,
      score: null,
      num_comments: null,
    },
  };
}

async function requestWithRetry(requestFn, label) {
  try {
    return await requestFn();
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      logger.warn(`reddit: ${label} rate limited — retrying in ${RETRY_DELAY_MS}ms`);
      await sleep(RETRY_DELAY_MS);
      return requestFn();
    }
    throw err;
  }
}

async function fetchSubredditJson(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.json`;

  const response = await requestWithRetry(
    () => axios.get(url, {
      params: {
        q: query,
        restrict_sr: 1,
        sort: 'new',
        limit: 100,
        t: 'month',
      },
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 30000,
    }),
    `JSON r/${subreddit}`
  );

  return (response.data?.data?.children || []).map(mapJsonPost);
}

async function fetchSubredditRss(subreddit, terms) {
  const url = `https://www.reddit.com/r/${subreddit}/new.rss`;

  const response = await requestWithRetry(
    () => axios.get(url, {
      params: { limit: 100 },
      headers: {
        'User-Agent': process.env.REDDIT_USER_AGENT,
        Accept: 'application/atom+xml',
      },
      timeout: 30000,
    }),
    `RSS r/${subreddit}`
  );

  const $ = cheerio.load(response.data, { xmlMode: true });
  const posts = [];

  $('entry').each((_, element) => {
    posts.push(mapRssEntry($(element), subreddit));
  });

  return posts.filter((post) => matchesQueryTerms(`${post.title} ${post.body}`, terms));
}

async function fetchSubredditQuery(subreddit, query, terms) {
  try {
    return await fetchSubredditJson(subreddit, query);
  } catch (jsonErr) {
    const status = jsonErr.response?.status;
    logger.warn(
      `reddit: JSON API blocked for r/${subreddit} (${status || jsonErr.message}) — falling back to RSS`
    );
    return fetchSubredditRss(subreddit, terms);
  }
}

async function scrapeReddit() {
  const results = [];
  const seen = new Set();
  let requestCount = 0;

  for (const subreddit of SUBREDDITS) {
    for (let q = 0; q < SEARCH_QUERIES.length; q += 1) {
      const query = SEARCH_QUERIES[q];
      const terms = QUERY_TERMS[q];

      try {
        const posts = await fetchSubredditQuery(subreddit, query, terms);

        for (const post of posts) {
          if (!post.body || !post.body.trim()) continue;

          const reviewDate = new Date(post.review_date);
          if (!isWithin90Days(reviewDate)) continue;
          if (!post.external_id || seen.has(post.external_id)) continue;

          seen.add(post.external_id);
          results.push(post);
        }

        logger.info(`reddit: fetched ${posts.length} raw posts from r/${subreddit} (query ${q + 1})`);
      } catch (err) {
        logger.error(`reddit: failed for r/${subreddit} query ${q + 1} — ${err.message}`);
      }

      requestCount += 1;
      if (requestCount < SUBREDDITS.length * SEARCH_QUERIES.length) {
        await sleep(DELAY_MS);
      }
    }
  }

  logger.info(`reddit: ${results.length} unique posts collected`);
  return results;
}

module.exports = { scrapeReddit };
