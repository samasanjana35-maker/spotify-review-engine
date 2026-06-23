const APP_STORE_ID = '324684580';
const PLAY_STORE_ID = 'com.spotify.music';

const KEYWORDS = [
  'discovery',
  'recommend',
  'repeat',
  'same songs',
  'bored',
  'algorithm',
  'suggest',
  'Discover Weekly',
  'find new',
  'explore',
  'tired',
  'stuck',
  'refresh',
  'new music',
];

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
  DATA_RANGE_DAYS,
  REDDIT_SUBREDDITS,
  BLUESKY_QUERIES,
  SOURCES,
};
