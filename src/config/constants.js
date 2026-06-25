const APP_STORE_ID = '324684580';
const PLAY_STORE_ID = 'com.spotify.music';

const KEYWORDS = [
  'discovery', 'discover', 'find new', 'new music', 'new artists', 'new songs',
  'explore', 'Discover Weekly', 'Daily Mix', 'Release Radar', 'Made for You',
  'recommend', 'recommendations', 'algorithm', 'suggest', 'suggestions',
  'for you', 'personalized', 'personalization', 'curated', 'tailored', 'based on',
  'repeat', 'repetitive', 'same songs', 'same music', 'same artists', 'same tracks',
  'bored', 'boring', 'stuck', 'tired', 'over and over', 'keeps playing',
  'always plays', 'played too much', 'stale', 'no variety',
  'playlist', 'radio', 'shuffle', 'AI DJ', 'Blend', 'mix',
  'variety', 'diverse', 'diversity', 'limited selection', 'filter bubble',
  'echo chamber', 'mainstream', 'niche', 'underground', 'genre',
  'refresh', 'reset', 'listening history', 'taste', 'taste profile', 'listening habits',
];
const KEYWORD_COUNT = KEYWORDS.length;

const DATA_RANGE_DAYS = 90;

const REDDIT_SUBREDDITS = ['spotify', 'truespotify'];

const BLUESKY_QUERIES = [
  'Spotify discovery',
  'Spotify recommendations',
  'Spotify algorithm',
];

const SOURCES = {
  APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  REDDIT: 'reddit',
  FORUMS: 'forums',
  BLUESKY: 'bluesky',
};

module.exports = {
  APP_STORE_ID,
  PLAY_STORE_ID,
  KEYWORDS,
  KEYWORD_COUNT,
  DATA_RANGE_DAYS,
  REDDIT_SUBREDDITS,
  BLUESKY_QUERIES,
  SOURCES,
};
