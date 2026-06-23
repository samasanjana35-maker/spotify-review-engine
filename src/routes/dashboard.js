const express = require('express');
const { getDashboardData } = require('../services/dashboardService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (err) {
    logger.error(`GET /api/dashboard failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;
