/**
 * Dashboard JS — All 7 upgrades wired up:
 *  U4: trend chart + date range filter
 *  U5: PM surprises + structured question fields (mainFinding, unexpectedSignal, etc.)
 *  U6: Segment × Need matrix
 *  U7: Methodology transparency panel + LOW CONFIDENCE badges
 */

const QUESTIONS = [
  'Why do users struggle to discover new music?',
  'What are the most common frustrations with Spotify\'s recommendations?',
  'What listening behaviors are users trying to achieve that the product currently blocks?',
  'What causes users to repeatedly listen to the same content against their will?',
  'Which user segments experience meaningfully different discovery challenges?',
  'What unmet needs appear consistently that Spotify has NOT addressed in any recent update?',
];

// ── Source icons ────────────────────────────────────────────────────────────

const APPLE_ICON = `<svg width="16" height="16" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.4-150.3-109.2C87 726.6 54.8 624.8 54.8 527.9 54.8 324.3 186.1 220 315.6 220c61.6 0 112.8 40.5 150.5 40.5 36.2 0 93.4-43.1 162.5-43.1 25.5 0 108.2 2.6 168.4 82.9zm-225.5-197.4c30.1-35.4 51.4-84.7 51.4-134.1 0-6.8-.6-13.7-1.9-19.3-48.3 1.9-106.5 32.1-141.5 72.5-27.2 30.8-52.6 80.1-52.6 130.1 0 7.4 1.3 14.8 1.9 17.1 3.2.6 8.4 1.3 13.6 1.3 43.5 0 98.3-28.7 129.1-67.6z"/></svg>`;
const GOOGLE_PLAY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3.609 1.814L13.792 12 3.61 22.186a1.067 1.067 0 0 1-.61-.92V2.734a1.067 1.067 0 0 1 .609-.92z" fill="#00C853"/><path d="M16.703 15.293 6.52 22.186l10.183-10.186 3.61 3.293z" fill="#FF1744"/><path d="M20.313 8.707 16.703 12l3.61 3.293L23.39 12a1.067 1.067 0 0 0 0-1.414L20.313 8.707z" fill="#FFD600"/><path d="M6.52 1.814 16.703 8.707 13.792 12 3.61 1.814z" fill="#2979FF"/></svg>`;
const BLUESKY_ICON = `<svg width="16" height="16" viewBox="0 0 600 530" fill="#1185FE" xmlns="http://www.w3.org/2000/svg"><path d="M135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.26-54.32 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7078-7.8964-.0174 2.9357-1.1937 6.3895-3.7078 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.956-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/></svg>`;

const SOURCE_META = {
  app_store:  { label: 'App Store',          icon: APPLE_ICON,       isSvg: true  },
  play_store: { label: 'Play Store',          icon: GOOGLE_PLAY_ICON, isSvg: true  },
  reddit:     { label: 'Reddit',              icon: '🔴'                            },
  forums:     { label: 'Community Forums',    icon: '💬'                            },
  bluesky:    { label: 'Bluesky',             icon: BLUESKY_ICON,     isSvg: true  },
};

const PILL_CLASS = {
  Bluesky:           'pill-bluesky',
  Reddit:            'pill-reddit',
  'Play Store':      'pill-play-store',
  'App Store':       'pill-app-store',
  'Community Forums':'pill-forums',
};

// ── Segment matrix labels ────────────────────────────────────────────────────
const SEGMENT_ROWS = [
  { key: 'free_user',          label: 'Free-tier users'        },
  { key: 'premium_user',       label: 'Premium users'          },
  { key: 'power_user',         label: 'Power users (5+ yrs)'   },
  { key: 'nostalgia_listener', label: 'Nostalgia-heavy listeners'},
  { key: 'genre_diverse',      label: 'Genre-diverse listeners' },
  { key: 'new_user',           label: 'New users (<6 months)'  },
];

const PAIN_COLS = [
  { key: 'repetitive_recs',       label: 'Repetitive recs'       },
  { key: 'no_playback_control',   label: 'No playback control'   },
  { key: 'ai_content_intrusion',  label: 'AI content intrusion'  },
  { key: 'shuffle_dysfunction',   label: 'Shuffle dysfunction'   },
  { key: 'filter_bubble',         label: 'Discovery filter bubble'},
  { key: 'lack_of_transparency',  label: 'Lack of transparency'  },
];

// Low confidence threshold: findings backed by < N reviews get a badge
const LOW_CONFIDENCE_THRESHOLD = 5;

// ── State ────────────────────────────────────────────────────────────────────
let isScraping = false;
let pollTimer = null;
let activePollRunId = null;
let cardObserver = null;
let progressInterval = null;
let currentStageIndex = 0;
const SCAN_STAGES = [
  { pct: 15, text: 'Connecting to sources...' },
  { pct: 30, text: 'Scraping App Store & Play Store...' },
  { pct: 50, text: 'Scraping Reddit & Community Forums...' },
  { pct: 65, text: 'Scraping Bluesky...' },
  { pct: 80, text: 'Filtering relevant reviews...' },
  { pct: 92, text: 'Running AI analysis...' },
  { pct: 99, text: 'Finalizing results...' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function easeOut(t) { return 1 - (1 - t) ** 3; }

function animateCounter(el, endValue, duration = 1500) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(endValue * easeOut(progress)).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateStats(stats, keywordCount) {
  animateCounter(document.getElementById('stat-scraped'),  stats?.totalScraped  || 0);
  animateCounter(document.getElementById('stat-filtered'), stats?.totalFiltered || 0);
  animateCounter(document.getElementById('stat-sources'),  5);
  animateCounter(document.getElementById('stat-keywords'), keywordCount || 52);
}

function getPillClass(source) { return PILL_CLASS[source] || 'pill-review'; }

// ── Loading / error ──────────────────────────────────────────────────────────

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

// ── Stats + source bars ──────────────────────────────────────────────────────

function renderStatsMeta(data) {
  document.getElementById('last-updated').textContent = `Last updated: ${formatDate(data.lastUpdated)}`;
  const runDate = formatDate(data.lastScrapeRun?.completedAt || data.lastScrapeRun?.startedAt);
  document.getElementById('footer-last-run').textContent = `Last run: ${runDate}`;
  animateStats(data.stats, data.methodology?.keywordCount);
}

function renderSourceBars(sources) {
  const container = document.getElementById('source-bars');
  container.innerHTML = '';

  Object.entries(SOURCE_META).forEach(([key, meta]) => {
    const raw      = sources?.[key]?.raw      || 0;
    const filtered = sources?.[key]?.filtered || 0;
    if (key === 'forums' && raw === 0 && filtered === 0) return;

    const barWidth = raw > 0 ? Math.max(2, Math.round((filtered / raw) * 100)) : 0;
    const iconClass = meta.isSvg ? 'source-icon source-icon-svg' : 'source-icon';
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <div class="source-label">
        <span class="${iconClass}">${meta.icon}</span>${meta.label}
      </div>
      <div class="source-bar-wrap">
        <div class="source-bar-track">
          <div class="source-bar-filtered${filtered > 0 ? ' has-fill' : ''}" data-width="${barWidth}"></div>
        </div>
      </div>
      <div class="source-counts">${filtered} / ${raw}</div>
    `;
    container.appendChild(row);
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    container.querySelectorAll('.source-bar-filtered').forEach((bar) => {
      bar.style.width = `${bar.dataset.width}%`;
    });
  }));
}

// ── AI Summary ───────────────────────────────────────────────────────────────

function renderSummary(analysis) {
  const card = document.getElementById('summary-card');
  if (!analysis?.summary) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  document.getElementById('summary-text').textContent = analysis.summary;
  document.getElementById('summary-meta').textContent =
    `Analyzed ${analysis.reviewCountAnalyzed || 0} reviews using ${analysis.modelUsed || 'Claude Sonnet'}`;
}

// ── UPGRADE 5: PM Surprises ──────────────────────────────────────────────────

function renderPmSurprises(pmSurprises) {
  const section = document.getElementById('pm-surprises-section');
  const list    = document.getElementById('pm-surprises-list');
  if (!section || !list) return;

  const surprises = pmSurprises || [];
  if (surprises.length === 0) { section.style.display = 'none'; return; }

  list.innerHTML = surprises.map((s, i) => `
    <div style="display:flex;gap:12px;margin-bottom:${i < surprises.length - 1 ? '12px' : '0'};">
      <span style="color:#1DB954;font-weight:700;font-size:16px;flex-shrink:0;margin-top:1px;">${i + 1}.</span>
      <p style="color:#e0e0e0;font-size:14px;line-height:1.6;margin:0;">${s}</p>
    </div>
  `).join('');
  section.style.display = 'block';
}

// ── UPGRADE 5 + 7: Question cards with new fields + LOW CONFIDENCE badges ────

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
  document.querySelectorAll('.question-card').forEach((c) => cardObserver.observe(c));
}

function renderQuestionCards(analysis) {
  const grid = document.getElementById('questions-grid');
  grid.innerHTML = '';

  if (!analysis) {
    grid.innerHTML = '<p class="no-data glass-card">No analysis available yet. Run a scrape to generate insights.</p>';
    return;
  }

  // Back-compat: merge competitiveIntel from q6 if not at top level
  if (!analysis.competitiveIntel && analysis.q6?.competitiveIntel) {
    analysis.competitiveIntel = analysis.q6.competitiveIntel;
  }

  for (let i = 1; i <= 6; i++) {
    const key = `q${i}`;
    const q = analysis[key];
    if (!q) continue;

    const severity    = (q.severity || 'medium').toLowerCase();
    const evidence    = (q.evidence || []).slice(0, 3);
    const reviewCount = q.reviewsCount || 0;
    const isLowConf   = reviewCount > 0 && reviewCount < LOW_CONFIDENCE_THRESHOLD;

    const card = document.createElement('div');
    card.className = `question-card glass-card severity-${severity}`;

    // Build the new structured fields block (only if prompt v2)
    const hasNewFields = q.mainFinding || q.unexpectedSignal;
    const newFieldsHtml = hasNewFields ? `
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">
        ${q.unexpectedSignal ? `
        <div style="padding:10px 12px;background:rgba(251,191,36,0.07);border-left:3px solid #fbbf24;border-radius:4px;">
          <div style="color:#fbbf24;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">⚡ Unexpected Signal</div>
          <div style="color:#e0e0e0;font-size:13px;line-height:1.5;">${q.unexpectedSignal}</div>
        </div>` : ''}
        ${q.segment ? `
        <div style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:4px;">
          <span style="color:#b3b3b3;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Segment most affected: </span>
          <span style="color:#e0e0e0;font-size:13px;">${q.segment}</span>
        </div>` : ''}
      </div>` : '';

    card.innerHTML = `
      <div class="card-watermark">Q${i}</div>
      <div class="q-header">
        <span class="q-number">Q${i}</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="severity-badge severity-${severity}">${severity.toUpperCase()}</span>
          ${isLowConf ? '<span style="background:rgba(251,191,36,0.15);color:#fbbf24;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:0.5px;">LOW CONFIDENCE</span>' : ''}
          ${q.quantification ? `<span style="color:#b3b3b3;font-size:11px;">${q.quantification}</span>` : ''}
        </div>
      </div>
      <h3 class="q-title">${QUESTIONS[i - 1]}</h3>
      <p class="q-answer">${q.answer || ''}</p>
      ${newFieldsHtml}
      <hr class="q-divider" />
      <h4 class="evidence-title">Evidence from real users</h4>
      <div class="evidence-list">
        ${evidence.map((item) => {
          const text   = typeof item === 'string' ? item : item.text;
          const source = typeof item === 'string' ? 'Review' : (item.source || 'Review');
          return `
            <blockquote class="evidence-quote">
              <span class="evidence-quote-mark">"</span>
              <p>${text}</p>
              <span class="source-pill ${getPillClass(source)}">${source}</span>
            </blockquote>`;
        }).join('')}
      </div>
      ${q.opportunity || q.productIntervention ? `
      <div style="margin-top:20px;padding:14px 16px;background:rgba(29,185,84,0.08);border-left:3px solid #1DB954;border-radius:6px;">
        <div style="color:#1DB954;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px;">💡 Product Opportunity</div>
        <div style="color:#e0e0e0;font-size:14px;line-height:1.6;">${q.productIntervention || q.opportunity}</div>
      </div>` : ''}
    `;
    grid.appendChild(card);
  }

  initCardObserver();
  renderCompetitiveIntel(analysis.competitiveIntel);
}

// ── Competitive intel ─────────────────────────────────────────────────────────

function renderCompetitiveIntel(compIntel) {
  const section = document.getElementById('competitive-intel-section');
  const list    = document.getElementById('competitive-intel-list');
  if (!section || !list) return;

  const nameMap = {
    apple_music: 'Apple Music', tidal: 'Tidal', qobuz: 'Qobuz',
    deezer: 'Deezer', youtube_music: 'YouTube Music', lastfm: 'Last.fm',
  };

  const entries = Object.entries(compIntel || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) { section.style.display = 'none'; return; }

  list.innerHTML = entries.map(([key, count]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #282828;">
      <span style="color:#e0e0e0;font-size:15px;">${nameMap[key] || key}</span>
      <span style="color:#1DB954;font-weight:700;font-size:15px;">${count} mention${count !== 1 ? 's' : ''}</span>
    </div>
  `).join('');
  section.style.display = 'block';
}

// ── UPGRADE 6: Segment × Need matrix ─────────────────────────────────────────

function matrixCellStyle(count) {
  if (!count || count === 0) return 'background:#111;color:#444;';
  if (count <= 3)  return 'background:#3a3000;color:#fbbf24;font-weight:600;';
  if (count <= 7)  return 'background:#3a1a00;color:#fb923c;font-weight:700;';
  return 'background:#3a0000;color:#f87171;font-weight:700;';
}

function renderSegmentMatrix(segmentMatrix) {
  const section = document.getElementById('segment-matrix-section');
  const table   = document.getElementById('segment-matrix-table');
  if (!section || !table) return;

  if (!segmentMatrix || Object.keys(segmentMatrix).length === 0) {
    section.style.display = 'none';
    return;
  }

  // Check at least 3 non-zero cells
  let nonZero = 0;
  for (const seg of SEGMENT_ROWS) {
    for (const pain of PAIN_COLS) {
      if ((segmentMatrix[seg.key]?.[pain.key] || 0) > 0) nonZero++;
    }
  }
  if (nonZero < 1) { section.style.display = 'none'; return; }

  const headerRow = `
    <thead>
      <tr>
        <th style="text-align:left;padding:8px 12px;color:#b3b3b3;font-size:12px;font-weight:600;white-space:nowrap;min-width:160px;background:#1a1a1a;">User Segment</th>
        ${PAIN_COLS.map((p) => `<th style="text-align:center;padding:8px 10px;color:#b3b3b3;font-size:11px;font-weight:600;white-space:nowrap;background:#1a1a1a;">${p.label}</th>`).join('')}
      </tr>
    </thead>`;

  const bodyRows = SEGMENT_ROWS.map((seg) => {
    const cells = PAIN_COLS.map((pain) => {
      const count = segmentMatrix[seg.key]?.[pain.key] || 0;
      return `<td style="text-align:center;padding:8px 10px;font-size:13px;${matrixCellStyle(count)}">${count > 0 ? count : ''}</td>`;
    }).join('');
    return `
      <tr>
        <td style="padding:8px 12px;color:#e0e0e0;font-size:13px;white-space:nowrap;background:#141414;">${seg.label}</td>
        ${cells}
      </tr>`;
  }).join('');

  table.innerHTML = `${headerRow}<tbody>${bodyRows}</tbody>`;
  section.style.display = 'block';
}

// ── UPGRADE 7: Methodology panel ─────────────────────────────────────────────

function renderMethodologyPanel(methodology) {
  const content = document.getElementById('methodology-content');
  if (!content || !methodology) return;

  const keywords = (methodology.keywords || []).map((k) =>
    `<code style="background:#222;color:#1DB954;padding:2px 6px;border-radius:3px;font-size:12px;margin:2px;display:inline-block;">${k}</code>`
  ).join(' ');

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;color:#b3b3b3;font-size:13px;line-height:1.6;">
      <div>
        <p style="color:#e0e0e0;font-weight:600;margin:0 0 6px;">AI Model</p>
        <p style="margin:0;">${methodology.aiModel || '—'} (prompt v${methodology.promptVersion || '1.0'})</p>
      </div>
      <div>
        <p style="color:#e0e0e0;font-weight:600;margin:0 0 6px;">Date Range</p>
        <p style="margin:0;">${methodology.dateRange || '—'}</p>
      </div>
      <div>
        <p style="color:#e0e0e0;font-weight:600;margin:0 0 6px;">Last scrape</p>
        <p style="margin:0;">${formatDate(methodology.scrapeCompleted)}</p>
      </div>
      <div>
        <p style="color:#e0e0e0;font-weight:600;margin:0 0 6px;">Reviews analysed</p>
        <p style="margin:0;">${(methodology.reviewCountAnalyzed || 0).toLocaleString()}</p>
      </div>
    </div>
    <div style="margin-top:18px;">
      <p style="color:#e0e0e0;font-weight:600;font-size:13px;margin:0 0 8px;">Relevance filter — ${methodology.keywordCount || 0} keywords (case-insensitive substring match)</p>
      <div style="line-height:1.8;">${keywords}</div>
      <p style="color:#888;font-size:12px;margin:8px 0 0;">${methodology.filterLogic || ''}</p>
    </div>
    <div style="margin-top:16px;padding:12px 14px;background:rgba(251,191,36,0.07);border-left:3px solid #fbbf24;border-radius:4px;">
      <p style="color:#fbbf24;font-size:12px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.8px;">Confidence note</p>
      <p style="color:#b3b3b3;font-size:13px;margin:0;">${methodology.confidenceNote}</p>
    </div>
  `;

  // Toggle arrow on open/close
  const details = document.getElementById('methodology-details');
  const arrow   = document.getElementById('methodology-arrow');
  if (details && arrow) {
    details.addEventListener('toggle', () => {
      arrow.style.transform = details.open ? 'rotate(90deg)' : 'rotate(0deg)';
    });
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderDashboard(data) {
  renderStatsMeta(data);
  renderSourceBars(data.stats?.sources);
  renderSummary(data.analysis);
  renderPmSurprises(data.analysis?.pmSurprises);
  renderQuestionCards(data.analysis);
  renderSegmentMatrix(data.analysis?.segmentMatrix);

  // Methodology panel
  renderMethodologyPanel(data.methodology);

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

// ── Scrape button & progress ──────────────────────────────────────────────────

function updateScanProgress(pct, text) {
  const fill   = document.getElementById('scan-progress-fill');
  const status = document.getElementById('scan-progress-status');
  if (fill)   fill.style.width = `${pct}%`;
  if (status) status.textContent = text;
}

function stopScanProgress() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

function startScanProgress() {
  const btn  = document.getElementById('scrape-btn');
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
  if (phase === 'analyzing' && currentStageIndex < 5) {
    currentStageIndex = 5;
    updateScanProgress(SCAN_STAGES[5].pct, SCAN_STAGES[5].text);
  }
}

async function finishScanProgress() {
  stopScanProgress();
  updateScanProgress(100, 'Complete! Loading dashboard...');
  await new Promise((r) => setTimeout(r, 1000));
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
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  activePollRunId = null;
}

function isPipelineComplete(response) {
  return response.pipelineComplete === true
    || (!response.isRunning && (response.status === 'completed' || response.status === 'failed'));
}

async function pollOnce(runId) {
  const response = await API.getScrapeStatus(runId);
  if (response.phase === 'analyzing') syncProgressToPhase('analyzing');
  return isPipelineComplete(response);
}

function startPolling(runId) {
  stopPolling();
  activePollRunId = runId;

  const scheduleNext = () => { pollTimer = setTimeout(runPoll, 3000); };

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
    } catch {
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

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('scrape-btn').addEventListener('click', handleScrapeClick);
  loadDashboard();
});
