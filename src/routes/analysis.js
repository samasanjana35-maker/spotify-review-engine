const express = require('express');
const { getOrRunAnalysis, analyzeReviews } = require('../services/analysisService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/latest', async (req, res, next) => {
  try {
    const results = await getOrRunAnalysis();
    res.json(results);
  } catch (err) {
    logger.error(`GET /api/analysis/latest failed: ${err.message}`);
    next(err);
  }
});

router.post('/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const results = await analyzeReviews(runId);
    res.json(results);
  } catch (err) {
    logger.error(`POST /api/analysis/${req.params.runId} failed: ${err.message}`);
    next(err);
  }
});

module.exports = router;
