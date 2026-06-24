const QUESTIONS = [
  'Why do users struggle to discover new music?',
  'What are the most common frustrations with recommendations?',
  'What listening behaviors are users trying to achieve?',
  'What causes users to repeatedly listen to the same content?',
  'Which user segments experience different discovery challenges?',
  'What unmet needs emerge consistently across reviews?',
];

const APPLE_ICON = `<svg width="16" height="16" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.4-150.3-109.2C87 726.6 54.8 624.8 54.8 527.9 54.8 324.3 186.1 220 315.6 220c61.6 0 112.8 40.5 150.5 40.5 36.2 0 93.4-43.1 162.5-43.1 25.5 0 108.2 2.6 168.4 82.9zm-225.5-197.4c30.1-35.4 51.4-84.7 51.4-134.1 0-6.8-.6-13.7-1.9-19.3-48.3 1.9-106.5 32.1-141.5 72.5-27.2 30.8-52.6 80.1-52.6 130.1 0 7.4 1.3 14.8 1.9 17.1 3.2.6 8.4 1.3 13.6 1.3 43.5 0 98.3-28.7 129.1-67.6z"/></svg>`;

const GOOGLE_PLAY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.609 1.814L13.792 12 3.61 22.186a1.067 1.067 0 0 1-.61-.92V2.734a1.067 1.067 0 0 1 .609-.92z" fill="#00C853"/><path d="M16.703 15.293 6.52 22.186l10.183-10.186 3.61 3.293z" fill="#FF1744"/><path d="M20.313 8.707 16.703 12l3.61 3.293L23.39 12a1.067 1.067 0 0 0 0-1.414L20.313 8.707z" fill="#FFD600"/><path d="M6.52 1.814 16.703 8.707 13.792 12 3.61 1.814z" fill="#2979FF"/></svg>`;

const BLUESKY_ICON = `<svg width="16" height="16" viewBox="0 0 600 530" fill="#1185FE" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.26-54.32 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7078-7.8964-.0174 2.9357-1.1937 6.3895-3.7078 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.956-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/></svg>`;

const SOURCE_META = {
  app_store: { label: 'App Store', icon: APPLE_ICON, isSvg: true },
  play_store: { label: 'Play Store', icon: GOOGLE_PLAY_ICON, isSvg: true },
  reddit: { label: 'Reddit', icon: '🔴' },
  forums: { label: 'Community Forums', icon: '💬' },
  bluesky: { label: 'Bluesky', icon: BLUESKY_ICON, isSvg: true },
};

const PILL_CLASS = {
  Bluesky: 'pill-bluesky',
  Reddit: 'pill-reddit',
  'Play Store': 'pill-play-store',
  'App Store': 'pill-app-store',
  'Community Forums': 'pill-forums',
};

let isScraping = false;
let pollTimer = null;
let activePollRunId = null;
let cardObserver = null;
let progressInterval = null;
let currentStageIndex = 0;

const SCAN_STAGES = [
  { pct: 15, text: 'Connecting to sources...' },
  { pct: 35, text: 'Scraping App Store & Play Store...' },
  { pct: 55, text: 'Scraping Reddit & Bluesky...' },
  { pct: 75, text: 'Filtering relevant reviews...' },
  { pct: 90, text: 'Running AI analysis...' },
  { pct: 99, text: 'Finalizing results...' },
];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCost(cost) {
  return `$${(cost || 0).toFixed(3)}`;
}


function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function animateCounter(el, endValue, duration = 1500, isCost = false) {
  const start = performance.now();
  const startVal = 0;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOut(progress);
    const current = startVal + (endValue - startVal) * eased;

    if (isCost) {
      el.textContent = `$${current.toFixed(3)}`;
    } else {
      el.textContent = Math.round(current).toLocaleString();
    }

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else if (isCost) {
      el.textContent = formatCost(endValue);
    } else {
      el.textContent = Math.round(endValue).toLocaleString();
    }
  }

  requestAnimationFrame(tick);
}

function animateStats(stats) {
  animateCounter(document.getElementById('stat-scraped'), stats?.totalScraped || 0);
  animateCounter(document.getElementById('stat-filtered'), stats?.totalFiltered || 0);
  animateCounter(document.getElementById('stat-sources'), 5);
  animateCounter(document.getElementById('stat-keywords'), 14);
}

function initCardObserver() {
  if (cardObserver) cardObserver.disconnect();

  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.question-card').forEach((card) => {
    cardObserver.observe(card);
  });
}

function getPillClass(source) {
  return PILL_CLASS[source] || 'pill-review';
}

function showLoading() {
  document.getElementById('dashboard-content').classList.add('hidden');
  document.getElementById('loading-skeleton').classList.remove('hidden');
  document.getElementById('error-banner').classList.add('hidden');
}

function showError(message) {
  document.getElementById('loading-skeleton').classList.add('hidden');
  document.getElementById('dashboard-content').classList.add('hidden');
  const banner = document.getElementById('error-banner');
  banner.textContent = message || 'Unable to load data. Try refreshing.';
  banner.classList.remove('hidden');
}

function showDashboard() {
  document.getElementById('loading-skeleton').classList.add('hidden');
  document.getElementById('error-banner').classList.add('hidden');
  document.getElementById('dashboard-content').classList.remove('hidden');
}

function renderStatsMeta(data) {
  const { stats, lastUpdated } = data;
  document.getElementById('last-updated').textContent = `Last updated: ${formatDate(lastUpdated)}`;
  const runDate = formatDate(data.lastScrapeRun?.completedAt || data.lastScrapeRun?.startedAt);
  document.getElementById('footer-last-run').textContent = `Last run: ${runDate}`;

  document.getElementById('stat-scraped').dataset.value = stats?.totalScraped || 0;
  document.getElementById('stat-filtered').dataset.value = stats?.totalFiltered || 0;
  document.getElementById('stat-sources').dataset.value = 5;
  document.getElementById('stat-keywords').dataset.value = 14;

  animateStats(stats);
}

function renderSourceBars(sources) {
  const container = document.getElementById('source-bars');
  container.innerHTML = '';

  Object.entries(SOURCE_META).forEach(([key, meta]) => {
    const raw = sources?.[key]?.raw || 0;
    const filtered = sources?.[key]?.filtered || 0;
    const isForumsEmpty = key === 'forums' && raw === 0 && filtered === 0;
    const iconClass = meta.isSvg ? 'source-icon source-icon-svg' : 'source-icon';

    const row = document.createElement('div');
    row.className = 'source-row';

    if (isForumsEmpty) {
      return;
    }

    const barWidth = raw > 0 ? Math.max(2, Math.round((filtered / raw) * 100)) : 0;
    const hasFill = filtered > 0;
    row.innerHTML = `
      <div class="source-label">
        <span class="${iconClass}">${meta.icon}</span>
        ${meta.label}
      </div>
      <div class="source-bar-wrap">
        <div class="source-bar-track">
          <div class="source-bar-filtered${hasFill ? ' has-fill' : ''}" data-width="${barWidth}"></div>
        </div>
      </div>
      <div class="source-counts">${filtered} / ${raw}</div>
    `;
    container.appendChild(row);
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.querySelectorAll('.source-bar-filtered').forEach((bar) => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    });
  });
}

function renderSummary(analysis) {
  const card = document.getElementById('summary-card');
  if (!analysis?.summary) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  document.getElementById('summary-text').textContent = analysis.summary;
  const model = analysis.modelUsed || 'Claude Sonnet';
  document.getElementById('summary-meta').textContent =
    `Analyzed ${analysis.reviewCountAnalyzed || 0} reviews using ${model}`;
}

function renderQuestionCards(analysis) {
  const grid = document.getElementById('questions-grid');
  grid.innerHTML = '';

  if (!analysis) {
    grid.innerHTML = '<p class="no-data glass-card">No analysis available yet. Run a scrape to generate insights.</p>';
    return;
  }

  for (let i = 1; i <= 6; i++) {
    const key = `q${i}`;
    const q = analysis[key];
    if (!q) continue;

    const severity = (q.severity || 'medium').toLowerCase();
    const evidence = (q.evidence || []).slice(0, 3);

    const card = document.createElement('div');
    card.className = `question-card glass-card severity-${severity}`;
    card.innerHTML = `
      <div class="card-watermark">Q${i}</div>
      <div class="q-header">
        <span class="q-number">Q${i}</span>
        <span class="severity-badge severity-${severity}">${severity.toUpperCase()}</span>
      </div>
      <h3 class="q-title">${QUESTIONS[i - 1]}</h3>
      <p class="q-answer">${q.answer || ''}</p>
      <hr class="q-divider" />
      <h4 class="evidence-title">Evidence from real users</h4>
      <div class="evidence-list">
        ${evidence.map((item) => {
          const text = typeof item === 'string' ? item : item.text;
          const source = typeof item === 'string' ? 'Review' : (item.source || 'Review');
          const pillClass = getPillClass(source);
          return `
            <blockquote class="evidence-quote">
              <span class="evidence-quote-mark">"</span>
              <p>${text}</p>
              <span class="source-pill ${pillClass}">${source}</span>
            </blockquote>
          `;
        }).join('')}
      </div>
      ${q.opportunity ? `
<div style="margin-top: 16px; padding: 12px 16px; background: rgba(29, 185, 84, 0.08); border-left: 3px solid #1DB954; border-radius: 4px;">
  <div style="color: #1DB954; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px;">💡 PRODUCT OPPORTUNITY</div>
  <div style="color: #e0e0e0; font-size: 14px; line-height: 1.6;">${q.opportunity}</div>
</div>
` : ''}
    `;
    grid.appendChild(card);
  }

  initCardObserver();

  // Render Competitive Intelligence section
  const compIntel = analysis.competitiveIntel || analysis.q6?.competitiveIntel;
  const compSection = document.getElementById('competitive-intel-section');
  const compList = document.getElementById('competitive-intel-list');

  if (compSection && compList) {
    compSection.style.display = 'none';
    compList.innerHTML = '';
  }

  if (compIntel) {
    const competitorNames = {
      apple_music: 'Apple Music',
      tidal: 'Tidal',
      qobuz: 'Qobuz',
      deezer: 'Deezer',
      youtube_music: 'YouTube Music',
      lastfm: 'Last.fm',
    };

    const sorted = Object.entries(compIntel)
      .filter(([key, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0) {
      const rows = sorted.map(([key, count]) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #282828;">
        <span style="color: #e0e0e0; font-size: 15px;">${competitorNames[key]}</span>
        <span style="color: #1DB954; font-weight: 700; font-size: 15px;">${count} mention${count !== 1 ? 's' : ''}</span>
      </div>
    `).join('');

      const section = document.getElementById('competitive-intel-section');
      const list = document.getElementById('competitive-intel-list');
      if (section && list) {
        list.innerHTML = rows;
        section.style.display = 'block';
      }
    }
  }
}

function renderDashboard(data) {
  renderStatsMeta(data);
  renderSourceBars(data.stats?.sources);
  renderSummary(data.analysis);
  renderQuestionCards(data.analysis);
  showDashboard();
}

async function loadDashboard() {
  showLoading();
  try {
    const data = await API.fetchDashboard();
    renderDashboard(data);
  } catch {
    showError('Unable to load data. Try refreshing.');
  }
}

async function refreshDashboardAfterScrape() {
  try {
    const data = await API.fetchDashboard();
    renderDashboard(data);
  } catch {
    showError('Scrape completed but failed to refresh dashboard. Try reloading the page.');
  }
}

function updateScanProgress(pct, text) {
  const fill = document.getElementById('scan-progress-fill');
  const status = document.getElementById('scan-progress-status');
  if (fill) fill.style.width = `${pct}%`;
  if (status) status.textContent = text;
}

function stopScanProgress() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function startScanProgress() {
  const btn = document.getElementById('scrape-btn');
  const wrap = document.getElementById('scan-progress-wrap');

  btn.disabled = true;
  btn.classList.remove('btn-pulse', 'scraping', 'complete', 'analyzing');
  wrap.classList.remove('hidden');

  currentStageIndex = 0;
  updateScanProgress(0, SCAN_STAGES[0].text);

  stopScanProgress();
  progressInterval = setInterval(() => {
    if (currentStageIndex < SCAN_STAGES.length - 1) {
      currentStageIndex += 1;
      const stage = SCAN_STAGES[currentStageIndex];
      updateScanProgress(stage.pct, stage.text);
    }
  }, 3500);
}

function hideScanProgress() {
  stopScanProgress();
  const wrap = document.getElementById('scan-progress-wrap');
  if (wrap) wrap.classList.add('hidden');
  updateScanProgress(0, SCAN_STAGES[0].text);
  currentStageIndex = 0;
}

function syncProgressToPhase(phase) {
  if (phase === 'analyzing' && currentStageIndex < 4) {
    currentStageIndex = 4;
    const stage = SCAN_STAGES[4];
    updateScanProgress(stage.pct, stage.text);
  }
}

async function finishScanProgress() {
  stopScanProgress();
  updateScanProgress(100, 'Complete! Loading dashboard...');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

function setScrapeButtonState(state) {
  const btn = document.getElementById('scrape-btn');
  if (state === 'idle') {
    btn.disabled = false;
    btn.innerHTML = 'Scan Reviews';
    btn.classList.remove('scraping', 'complete', 'analyzing');
    btn.classList.add('btn-pulse');
    hideScanProgress();
  }
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  activePollRunId = null;
}

function isPipelineComplete(response) {
  return response.pipelineComplete === true
    || (!response.isRunning && (response.status === 'completed' || response.status === 'failed'));
}

async function pollOnce(runId) {
  const response = await API.getScrapeStatus(runId);

  if (response.phase === 'analyzing') {
    syncProgressToPhase('analyzing');
  }

  return isPipelineComplete(response);
}

function startPolling(runId) {
  stopPolling();
  activePollRunId = runId;

  const scheduleNext = () => {
    pollTimer = setTimeout(runPoll, 3000);
  };

  const runPoll = async () => {
    if (activePollRunId !== runId) return;

    try {
      const done = await pollOnce(runId);
      if (done) {
        stopPolling();
        await finishScanProgress();
        await refreshDashboardAfterScrape();
        isScraping = false;
        setScrapeButtonState('idle');
        return;
      }
      scheduleNext();
    } catch (err) {
      stopPolling();
      isScraping = false;
      hideScanProgress();
      setScrapeButtonState('idle');
      showError('Lost connection while scraping. Check server and try again.');
    }
  };

  runPoll();
}

async function handleScrapeClick() {
  if (isScraping) return;

  isScraping = true;
  startScanProgress();

  try {
    const { scrapeRunId } = await API.startScrape('manual');
    startPolling(scrapeRunId);
  } catch {
    isScraping = false;
    hideScanProgress();
    setScrapeButtonState('idle');
    showError('Failed to start scrape. Please try again.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scrape-btn').addEventListener('click', handleScrapeClick);
  loadDashboard();
});
