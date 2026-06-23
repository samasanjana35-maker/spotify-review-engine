const API = {
  async fetchDashboard() {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`Dashboard API error: ${res.status}`);
    return res.json();
  },

  async startScrape(triggeredBy = 'manual') {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy }),
    });
    if (!res.ok) throw new Error(`Scrape API error: ${res.status}`);
    return res.json();
  },

  async getScrapeStatus(runId) {
    const res = await fetch(`/api/scrape/status/${runId}`);
    if (!res.ok) throw new Error(`Status API error: ${res.status}`);
    return res.json();
  },
};
