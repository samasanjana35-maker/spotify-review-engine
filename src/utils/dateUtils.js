const { DATA_RANGE_DAYS } = require('../config/constants');

function getCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DATA_RANGE_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function isWithin90Days(date) {
  const reviewDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(reviewDate.getTime())) {
    return false;
  }
  return reviewDate >= getCutoffDate();
}

module.exports = { getCutoffDate, isWithin90Days };
