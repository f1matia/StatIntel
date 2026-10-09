/* ═══════════════════════════════════════════════════════════════════
   StatIntel — Application Logic v2.0
   Complete client-side application with Chart.js charts, analytics
   integration, officer drawer with deep analysis, registration flow,
   and competency heatmap rendering.
   ═══════════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
let token = localStorage.getItem('statintel_token') || '';
let currentUser = null;
let officers = [], skills = [], courses = [], roles = [], gaps = [];
let modalSave = null;
let charts = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ── Toast ──────────────────────────────────────────────────────────
function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ── API Helper ─────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      logout(false);
    }
    throw new Error(data?.detail || data || `Request failed (${res.status})`);
  }
  return data;
}

// ── Auth ───────────────────────────────────────────────────────────
function logout(show = true) {
  token = '';
  currentUser = null;
  localStorage.removeItem('statintel_token');
  $('appShell').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginForm').classList.remove('hidden');
  $('registerForm').classList.add('hidden');
  if (show) toast('Signed out.');
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { username: $('username').value.trim(), password: $('password').value }
    });
    token = result.access_token;
    localStorage.setItem('statintel_token', token);
    currentUser = { username: result.username, role: result.role, full_name: result.full_name };
    await startApp();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

$('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('registerError').textContent = '';
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: {
        username: $('regUsername').value.trim(),
        password: $('regPassword').value,
        full_name: $('regFullName').value.trim(),
        email: $('regEmail').value.trim(),
      }
    });
    token = result.access_token;
    localStorage.setItem('statintel_token', token);
    currentUser = { username: result.username, role: result.role, full_name: result.full_name };
    toast('Account created! Welcome to StatIntel.');
    await startApp();
  } catch (err) {
    $('registerError').textContent = err.message;
  }
});

$('showRegisterBtn').onclick = () => {
  $('loginForm').classList.add('hidden');
  $('registerForm').classList.remove('hidden');
};
$('showLoginBtn').onclick = () => {
  $('registerForm').classList.add('hidden');
  $('loginForm').classList.remove('hidden');
};

async function startApp() {
  try {
    currentUser = await api('/api/auth/me');
    const displayName = currentUser.full_name || currentUser.username;
    $('userLabel').textContent = displayName + ' · ' + currentUser.role;
    $('userDisplayName').textContent = displayName;
    $('userRole').textContent = currentUser.role;
    $('userAvatar').textContent = (displayName[0] || '?').toUpperCase();
    $('loginScreen').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    await refreshAll();
    await checkHealth();
  } catch (e) {
    logout(false);
    $('loginError').textContent = e.message;
  }
}

$('logoutBtn').onclick = () => logout();

// ── Navigation ─────────────────────────────────────────────────────
const pageLabels = {
  overview: 'Overview', analytics: 'Analytics', officers: 'Officer profiles',
  skills: 'Skill intelligence', learning: 'Learning catalogue',
  roles: 'Role registry', graph: 'Knowledge graph', reports: 'Reports & exports'
};

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('pageCrumb').textContent = pageLabels[page] || page;
  if (page === 'graph') { renderGraph(); initCopilotHandlers(); }
  if (page === 'skills') loadGaps();
  if (page === 'learning') loadCourses();
  if (page === 'roles') loadRoles();
  if (page === 'officers') loadOfficers();
  if (page === 'analytics') loadAnalytics();
}

$('nav').onclick = e => { const b = e.target.closest('[data-page]'); if (b) navigate(b.dataset.page); };
document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => navigate(b.dataset.goto));
$('mobileNav').onclick = () => $('sidebar').classList.toggle('mobile-open');

// ── Data Loading ───────────────────────────────────────────────────
async function refreshAll() {
  await Promise.all([loadDashboard(), loadOfficers(), loadSkills(), loadCourses(), loadRoles()]);
  await loadGaps();
}

async function checkHealth() {
  try {
    const h = await api('/api/health');
    $('dbStatus').textContent = `API v${h.version || '?'} · ${h.records?.officers || 0} records`;
    $('healthResult').textContent = JSON.stringify(h, null, 2);
  } catch (e) {
    $('dbStatus').textContent = 'Connection issue';
    $('healthResult').textContent = e.message;
  }
}

$('refreshBtn').onclick = async () => {
  try { await refreshAll(); toast('Dashboard refreshed.'); } catch (e) { toast(e.message); }
};
$('healthCheckBtn').onclick = checkHealth;

// ── Dashboard ──────────────────────────────────────────────────────
async function loadDashboard() {
  const [d, people] = await Promise.all([api('/api/dashboard'), api('/api/officers')]);
  officers = people;
  $('metricProfiles').textContent = d.profile_count.toLocaleString();
  $('metricReadiness').textContent = d.average_readiness.toFixed(1) + '%';
  $('metricGaps').textContent = d.reported_gaps.toLocaleString();
  $('metricMedian').textContent = (d.readiness_median || 0).toFixed(1) + '%';

  // Readiness chart (Chart.js)
  renderReadinessChart(people);
  renderPriorityPreview(d.priority_skills || []);
  renderDeptChart(d.departments || []);

  // Recent table
  $('recentRows').innerHTML = people.slice(0, 8).map(p => `
    <tr class="clickable-row" data-officer-id="${p.id}">
      <td><b>${esc(p.name)}</b><small>${p.is_demo ? 'Synthetic demo' : 'User supplied'}</small></td>
      <td>${esc(p.department)}</td>
      <td>${esc(p.current_role)}</td>
      <td>${readinessCell(p.readiness)}</td>
      <td>${p.open_gaps}</td>
    </tr>
  `).join('') || emptyRow(5, 'No profiles yet.');
  bindRowClicks('recentRows');
}

function readinessCell(n) {
  const value = Math.max(0, Math.min(100, Number(n) || 0));
  const color = value < 40 ? '#9e3523' : value < 60 ? '#a47730' : value < 80 ? '#4a7d9e' : '#3d7a5f';
  return `<div class="readiness"><span class="mini-track"><i style="width:${value}%;background:${color}"></i></span><b>${value.toFixed(0)}%</b></div>`;
}

function renderReadinessChart(people) {
  const ctx = $('readinessCanvas');
  if (!ctx) return;
  const bands = [
    { label: 'Critical (0–39%)', filter: p => p.readiness < 40, color: '#9e3523' },
    { label: 'Developing (40–59%)', filter: p => p.readiness >= 40 && p.readiness < 60, color: '#a47730' },
    { label: 'Proficient (60–79%)', filter: p => p.readiness >= 60 && p.readiness < 80, color: '#4a7d9e' },
    { label: 'Advanced (80–100%)', filter: p => p.readiness >= 80, color: '#3d7a5f' },
  ];
  const data = bands.map(b => people.filter(b.filter).length);
  const labels = bands.map(b => b.label);
  const colors = bands.map(b => b.color);

  if (charts.readiness) charts.readiness.destroy();
  charts.readiness = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 3, barPercentage: 0.6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw} officer${ctx.raw !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { grid: { color: '#e8e4d8' }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 10, family: 'Georgia, serif' } } },
      },
    },
  });
}

function renderDeptChart(departments) {
  const ctx = $('deptCanvas');
  if (!ctx || !departments.length) return;
  if (charts.dept) charts.dept.destroy();
  charts.dept = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: departments.map(d => d.name.length > 25 ? d.name.slice(0, 23) + '…' : d.name),
      datasets: [{
        label: 'Avg readiness %',
        data: departments.map(d => d.avg_readiness),
        backgroundColor: departments.map(d => d.avg_readiness >= 70 ? '#3d7a5f' : d.avg_readiness >= 50 ? '#4a7d9e' : '#9e3523'),
        borderRadius: 3,
        barPercentage: 0.55,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw}% avg · ${departments[ctx.dataIndex].count} officers` } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: '#e8e4d8' }, ticks: { font: { size: 10 }, callback: v => v + '%' } },
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } },
      },
    },
  });
}

function renderPriorityPreview(items) {
  $('priorityPreview').innerHTML = items.slice(0, 6).map((x, i) => {
    const mentions = x.profile_mentions;
    const severity = x.severity || {};
    const level = severity.level || (mentions >= 3 ? 'high' : mentions ? 'moderate' : 'unobserved');
    return `<div class="list-item">
      <span class="list-index">0${i + 1}</span>
      <div class="list-main">
        <b>${esc(x.skill)}</b>
        <small>${mentions} mention${mentions !== 1 ? 's' : ''} · severity ${severity.score || '—'}</small>
      </div>
      <span class="priority ${level}">${level.toUpperCase()}</span>
    </div>`;
  }).join('') || '<p class="empty">No matching skill mentions yet.</p>';
}

function emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" class="empty">${esc(msg)}</td></tr>`;
}

// ── Analytics Page ─────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const [wf, hm] = await Promise.all([api('/api/analytics/workforce'), api('/api/analytics/heatmap')]);
    renderAnalyticsSummary(wf);
    renderHistogram(wf.readiness?.histogram || []);
    renderRadar(wf.skill_coverage || []);
    renderBands(wf.readiness?.bands || {});
    renderTrend(wf.trend_projection || []);
    renderHeatmap(hm);
    $('methodologyNote').textContent = wf.methodology || '';
  } catch (e) {
    toast('Analytics: ' + e.message);
  }
}

$('refreshAnalytics').onclick = loadAnalytics;

function renderAnalyticsSummary(wf) {
  const s = wf.readiness?.descriptive_stats || {};
  $('anN').textContent = s.n ?? '—';
  $('anMean').textContent = s.mean != null ? s.mean.toFixed(1) + '%' : '—';
  $('anStdDev').textContent = s.std_dev != null ? s.std_dev.toFixed(1) : '—';
  $('anSkew').textContent = s.skewness != null ? s.skewness.toFixed(3) : '—';
  $('anMedian').textContent = s.median != null ? s.median.toFixed(1) + '%' : '—';
  $('anIQR').textContent = s.iqr != null ? s.iqr.toFixed(1) : '—';
  $('anKurt').textContent = s.kurtosis != null ? s.kurtosis.toFixed(3) : '—';
  $('anCV').textContent = s.cv != null ? s.cv.toFixed(1) + '%' : '—';
}

function renderHistogram(bins) {
  const ctx = $('histCanvas');
  if (!ctx || !bins.length) return;
  if (charts.hist) charts.hist.destroy();
  charts.hist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(b => `${b.bin_start}–${b.bin_end}`),
      datasets: [{
        label: 'Frequency',
        data: bins.map(b => b.count),
        backgroundColor: bins.map(b => {
          const mid = (b.bin_start + b.bin_end) / 2;
          return mid < 40 ? '#9e3523' : mid < 60 ? '#a47730' : mid < 80 ? '#4a7d9e' : '#3d7a5f';
        }),
        borderRadius: 2,
        barPercentage: 0.92,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw} officer${ctx.raw !== 1 ? 's' : ''} (${(bins[ctx.dataIndex].frequency * 100).toFixed(1)}%)` } },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#e8e4d8' }, ticks: { font: { size: 10 }, stepSize: 1 }, title: { display: true, text: 'Count', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 }, title: { display: true, text: 'Readiness %', font: { size: 10 } } },
      },
    },
  });
}

function renderRadar(coverage) {
  const ctx = $('radarCanvas');
  if (!ctx || !coverage.length) return;
  if (charts.radar) charts.radar.destroy();
  const top8 = coverage.slice(0, 8);
  charts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: top8.map(c => c.skill.length > 20 ? c.skill.slice(0, 18) + '…' : c.skill),
      datasets: [
        { label: 'Coverage %', data: top8.map(c => c.coverage_pct), backgroundColor: 'rgba(61,122,95,0.15)', borderColor: '#3d7a5f', borderWidth: 2, pointRadius: 3 },
        { label: 'Gap %', data: top8.map(c => c.gap_pct), backgroundColor: 'rgba(158,53,35,0.1)', borderColor: '#9e3523', borderWidth: 2, pointRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 12 } } },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { font: { size: 8 }, stepSize: 25 },
          pointLabels: { font: { size: 9, family: 'Georgia, serif' } },
          grid: { color: '#e8e4d8' },
        },
      },
    },
  });
}

function renderBands(bands) {
  const ctx = $('bandCanvas');
  if (!ctx) return;
  if (charts.band) charts.band.destroy();
  const order = ['critical', 'developing', 'proficient', 'advanced'];
  const colors = { critical: '#9e3523', developing: '#a47730', proficient: '#4a7d9e', advanced: '#3d7a5f' };
  const labels = order.map(k => (bands[k]?.range || k).replace(/\b\w/g, l => l.toUpperCase()));
  const data = order.map(k => bands[k]?.count || 0);

  charts.band = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: order.map(k => colors[k]), borderWidth: 2, borderColor: '#faf8f1' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} officer${ctx.raw !== 1 ? 's' : ''}` } },
      },
    },
  });
}

function renderTrend(projection) {
  const ctx = $('trendCanvas');
  if (!ctx || !projection.length) return;
  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: projection.map(p => p.quarter),
      datasets: [{
        label: 'Projected readiness %',
        data: projection.map(p => p.projected_readiness),
        borderColor: '#4a7d9e',
        backgroundColor: 'rgba(74,125,158,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: '#4a7d9e',
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw.toFixed(1)}% (±${projection[ctx.dataIndex].confidence_interval}%)` } },
      },
      scales: {
        y: { beginAtZero: false, grid: { color: '#e8e4d8' }, ticks: { font: { size: 10 }, callback: v => v + '%' } },
        x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Georgia, serif' } } },
      },
    },
  });
}

function renderHeatmap(hm) {
  const container = $('heatmapContainer');
  if (!container || !hm.matrix?.length) {
    container.innerHTML = '<p class="empty">No data for heatmap.</p>';
    return;
  }
  const skills = hm.skills || [];
  let html = '<table class="heatmap-table"><thead><tr><th></th>';
  skills.forEach(s => {
    html += `<th class="rotated">${esc(s.length > 22 ? s.slice(0, 20) + '…' : s)}</th>`;
  });
  html += '</tr></thead><tbody>';
  hm.matrix.forEach(row => {
    html += `<tr><th style="text-align:right;white-space:nowrap;padding-right:12px">${esc(row.department.length > 30 ? row.department.slice(0, 28) + '…' : row.department)} <small style="color:#999">(${row.officer_count})</small></th>`;
    skills.forEach(s => {
      const cell = row.skills[s] || {};
      const pct = cell.coverage_pct || 0;
      const cls = pct >= 75 ? 'heat-high' : pct >= 50 ? 'heat-medium' : pct >= 25 ? 'heat-low' : 'heat-minimal';
      html += `<td><div class="heatmap-cell ${cls}" title="${esc(s)}: ${pct}% coverage">${pct > 0 ? pct + '%' : '—'}</div></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Officers ───────────────────────────────────────────────────────
async function loadOfficers() {
  officers = await api('/api/officers?q=' + encodeURIComponent($('officerSearch').value || ''));
  $('officerRows').innerHTML = officers.map(p => `
    <tr>
      <td><b class="officer-link" data-id="${p.id}" style="cursor:pointer;color:var(--accent)">${esc(p.name)}</b><small>${p.is_demo ? 'Synthetic seed data' : 'User supplied'}</small></td>
      <td>${esc(p.department)}</td>
      <td>${esc(p.current_role)}</td>
      <td>${esc(p.target_role)}</td>
      <td>${readinessCell(p.readiness)}</td>
      <td>${p.open_gaps}</td>
      <td class="row-actions">
        <button class="text-btn" data-view-officer="${p.id}">View</button>
        <button class="text-btn" data-edit-officer="${p.id}">Edit</button>
        <button class="text-btn danger-text" data-delete-officer="${p.id}">Delete</button>
      </td>
    </tr>
  `).join('') || emptyRow(7, 'No matching profiles.');

  $('officerRows').querySelectorAll('[data-view-officer]').forEach(b => b.onclick = () => openOfficerDrawer(Number(b.dataset.viewOfficer)));
  $('officerRows').querySelectorAll('.officer-link').forEach(b => b.onclick = () => openOfficerDrawer(Number(b.dataset.id)));
  $('officerRows').querySelectorAll('[data-edit-officer]').forEach(b => b.onclick = () => editOfficer(Number(b.dataset.editOfficer)));
  $('officerRows').querySelectorAll('[data-delete-officer]').forEach(b => b.onclick = () => deleteOfficer(Number(b.dataset.deleteOfficer)));
}

function bindRowClicks(containerId) {
  document.querySelectorAll(`#${containerId} .clickable-row`).forEach(row => {
    row.style.cursor = 'pointer';
    row.onclick = () => openOfficerDrawer(Number(row.dataset.officerId));
  });
}

$('officerSearch').oninput = () => loadOfficers().catch(e => toast(e.message));

// ── Officer Drawer (deep analysis) ─────────────────────────────────
async function openOfficerDrawer(id) {
  $('officerDrawer').classList.remove('hidden');
  $('drawerOfficerName').textContent = 'Loading…';
  $('drawerBody').innerHTML = '<p class="muted">Fetching analysis…</p>';
  try {
    const data = await api(`/api/analytics/officer/${id}`);
    const o = data.officer;
    $('drawerOfficerName').textContent = o.name;

    let html = '';
    // Summary stats
    html += `<div class="drawer-section">
      <h3>Readiness Assessment</h3>
      <div class="drawer-stat-row">
        <div class="drawer-stat"><strong>${o.readiness.toFixed(0)}%</strong><small>Readiness</small></div>
        <div class="drawer-stat"><strong>${o.open_gaps}</strong><small>Open gaps</small></div>
        <div class="drawer-stat"><strong style="font-size:14px">${esc(data.readiness_band)}</strong><small>Band</small></div>
      </div>
      <div style="padding:10px 14px;background:var(--panel2);border-radius:3px;font-size:11px;line-height:1.7;color:var(--muted)">
        ${esc(data.interpretation)}
      </div>
    </div>`;

    // Officer details
    html += `<div class="drawer-section">
      <h3>Profile Details</h3>
      <table style="width:100%">
        <tr><td style="font-weight:600;width:40%">Department</td><td>${esc(o.department)}</td></tr>
        <tr><td style="font-weight:600">Current role</td><td>${esc(o.current_role)}</td></tr>
        <tr><td style="font-weight:600">Target role</td><td>${esc(o.target_role)}</td></tr>
      </table>
    </div>`;

    // Skill profile
    html += `<div class="drawer-section">
      <h3>Competency Profile (${data.evidenced_count} evidenced · ${data.gap_count} gaps · ${data.unassessed_count} unassessed)</h3>`;
    (data.skill_profile || []).forEach(s => {
      html += `<span class="skill-tag ${s.status}">${esc(s.skill)}</span>`;
    });
    html += '</div>';

    // Gap remediation
    if (data.gap_remediation?.length) {
      html += '<div class="drawer-section"><h3>Recommended Learning</h3>';
      data.gap_remediation.forEach(r => {
        html += `<div style="margin-bottom:8px"><b style="font-size:11px;color:var(--accent)">${esc(r.skill)}</b> <small style="color:var(--muted)">${esc(r.domain)}</small>`;
        if (r.courses.length) {
          r.courses.forEach(c => {
            html += `<div class="course-recommend"><b>${esc(c.name)}</b><small>${esc(c.provider)} · ${esc(c.duration)} · ${c.verified ? 'Verified' : 'Unverified'}</small></div>`;
          });
        } else {
          html += '<div class="course-recommend"><small>No matching courses in catalogue</small></div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    $('drawerBody').innerHTML = html;
  } catch (e) {
    $('drawerBody').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

$('drawerClose').onclick = () => $('officerDrawer').classList.add('hidden');
$('officerDrawer').onclick = e => { if (e.target === $('officerDrawer')) $('officerDrawer').classList.add('hidden'); };

// ── Modal Forms ────────────────────────────────────────────────────
function fieldsMarkup(fields, values = {}) {
  return fields.map(f => {
    const value = values[f.key] ?? f.value ?? '';
    if (f.type === 'textarea')
      return `<label>${esc(f.label)}<textarea name="${esc(f.key)}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(Array.isArray(value) ? value.join('; ') : value)}</textarea></label>`;
    if (f.type === 'select')
      return `<label>${esc(f.label)}<select name="${esc(f.key)}">${f.options.map(o => `<option ${String(value) === String(o.value) ? 'selected' : ''} value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>`;
    return `<label>${esc(f.label)}<input name="${esc(f.key)}" type="${f.type || 'text'}" value="${esc(value)}" ${f.required ? 'required' : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} placeholder="${esc(f.placeholder || '')}"></label>`;
  }).join('');
}

function openForm(title, fields, values, save) {
  $('modalTitle').textContent = title;
  $('modalFields').innerHTML = fieldsMarkup(fields, values);
  $('modalError').textContent = '';
  $('modalBack').classList.remove('hidden');
  modalSave = save;
}

function closeForm() { $('modalBack').classList.add('hidden'); modalSave = null; }

$('modalClose').onclick = closeForm;
$('modalCancel').onclick = closeForm;
$('modalBack').onclick = e => { if (e.target === $('modalBack')) closeForm(); };
$('entityForm').onsubmit = async e => {
  e.preventDefault();
  if (!modalSave) return;
  const fd = new FormData(e.currentTarget);
  const values = Object.fromEntries(fd.entries());
  try {
    await modalSave(values);
    closeForm();
    await refreshAll();
    toast('Saved to the database.');
  } catch (err) {
    $('modalError').textContent = err.message;
  }
};

const officerFields = [
  { key: 'name', label: 'Officer name', required: true },
  { key: 'department', label: 'Department' },
  { key: 'current_role', label: 'Current role', required: true },
  { key: 'target_role', label: 'Target role' },
  { key: 'readiness', label: 'Readiness (0–100)', type: 'number', min: 0, max: 100, required: true },
  { key: 'open_gaps', label: 'Open skill gaps', type: 'number', min: 0, max: 1000, required: true },
  { key: 'years_in_role', label: 'Years in current role', type: 'number', min: 0, max: 50 },
  { key: 'qualification', label: 'Qualification' },
  { key: 'skills', label: 'Evidenced skills', type: 'textarea', placeholder: 'Separate skills with semicolons' },
  { key: 'missing_skills', label: 'Missing skills', type: 'textarea', placeholder: 'Separate skills with semicolons' },
  { key: 'assessment_source', label: 'Assessment source / evidence reference', required: true },
  { key: 'assessment_date', label: 'Assessment date (YYYY-MM-DD)' },
];

function officerPayload(v, isDemo = false) {
  return {
    ...v,
    readiness: Number(v.readiness),
    open_gaps: Number(v.open_gaps),
    years_in_role: Number(v.years_in_role || 0),
    skills: (v.skills || '').split(/[;|]/).map(s => s.trim()).filter(Boolean),
    missing_skills: (v.missing_skills || '').split(/[;|]/).map(s => s.trim()).filter(Boolean),
    is_demo: isDemo,
  };
}

$('addOfficerBtn').onclick = () => openForm('Add officer profile', officerFields, {
  readiness: 60, open_gaps: 0, years_in_role: 0,
  department: 'Not specified', current_role: 'Not specified',
  target_role: 'Not specified', assessment_source: 'User-entered; unverified',
}, async v => api('/api/officers', { method: 'POST', body: officerPayload(v, false) }));

async function editOfficer(id) {
  const p = await api('/api/officers');
  const x = p.find(v => v.id === id);
  if (!x) return;
  openForm('Edit officer profile', officerFields, {
    ...x, skills: x.skills, missing_skills: x.missing_skills,
  }, async v => api('/api/officers/' + id, { method: 'PUT', body: officerPayload(v, x.is_demo) }));
}

async function deleteOfficer(id) {
  const p = officers.find(x => x.id === id);
  if (!p || !confirm(`Delete profile for ${p.name}? This cannot be undone.`)) return;
  try { await api('/api/officers/' + id, { method: 'DELETE' }); await refreshAll(); toast('Profile deleted.'); }
  catch (e) { toast(e.message); }
}

// CSV Import/Export
$('importCsvBtn').onclick = () => $('csvFile').click();
$('csvFile').onchange = async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const result = await api('/api/officers/import-csv', { method: 'POST', body: fd });
    await refreshAll();
    toast(`Import: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`);
  } catch (err) { toast(err.message); }
  finally { e.target.value = ''; }
};

// ── Skills ─────────────────────────────────────────────────────────
async function loadSkills() {
  skills = await api('/api/skills');
}

async function loadGaps() {
  try {
    const result = await api('/api/gap-analysis');
    gaps = result.items || [];
    $('gapMethod').innerHTML = `<b>Methodology</b><span>${esc(result.method)} ${esc(result.data_quality_warning)}</span>`;

    $('skillRows').innerHTML = gaps.map(g => `
      <tr>
        <td><b>${esc(g.skill)}</b></td>
        <td>${esc(g.domain)}</td>
        <td>${g.profile_mentions}</td>
        <td><b>${g.severity_score?.toFixed(1) || '—'}</b><small>${g.mention_ratio || 0}% of profiles</small></td>
        <td><span class="priority ${g.severity_level || 'unobserved'}">${(g.severity_level || 'NONE').toUpperCase()}</span></td>
        <td>${esc(g.source_status)}${g.profiles?.length ? '<small>' + g.profiles.slice(0, 3).map(esc).join(', ') + (g.profiles.length > 3 ? ` +${g.profiles.length - 3} more` : '') + '</small>' : ''}</td>
      </tr>
    `).join('') || emptyRow(6, 'No skills in the catalogue yet.');

    renderPriorityPreview(gaps.map(g => ({ skill: g.skill, profile_mentions: g.profile_mentions, severity: { score: g.severity_score, level: g.severity_level } })));
  } catch (e) {
    $('gapMethod').textContent = e.message;
  }
}

$('addSkillBtn').onclick = () => openForm('Add skill', [
  { key: 'name', label: 'Skill name', required: true },
  { key: 'domain', label: 'Domain', required: true },
  { key: 'description', label: 'Definition / description', type: 'textarea' },
  { key: 'source_reference', label: 'Authoritative source reference / URL' },
  { key: 'review_status', label: 'Review status' },
], { domain: 'General', review_status: 'Pending review' }, async v => api('/api/skills', { method: 'POST', body: v }));

// ── Courses ────────────────────────────────────────────────────────
async function loadCourses() {
  courses = await api('/api/courses?q=' + encodeURIComponent($('courseSearch').value || ''));
  $('courseRows').innerHTML = courses.map(c => `
    <tr>
      <td><b>${esc(c.name)}</b></td>
      <td>${esc(c.provider)}</td>
      <td>${esc(c.skill_name)}</td>
      <td>${esc(c.duration)}</td>
      <td><span class="priority ${c.verified ? 'low' : 'moderate'}">${c.verified ? 'VERIFIED' : 'UNVERIFIED'}</span></td>
      <td>${c.source_reference ? `<a href="${esc(c.source_reference)}" target="_blank" rel="noreferrer">Source →</a>` : 'Not supplied'}</td>
    </tr>
  `).join('') || emptyRow(6, 'No learning programmes yet.');
}

$('courseSearch').oninput = () => loadCourses().catch(e => toast(e.message));
$('addCourseBtn').onclick = () => openForm('Add learning programme', [
  { key: 'name', label: 'Programme name', required: true },
  { key: 'provider', label: 'Provider', required: true },
  { key: 'skill_name', label: 'Skill focus', required: true },
  { key: 'domain', label: 'Domain' },
  { key: 'duration', label: 'Duration' },
  { key: 'url', label: 'Course URL (optional)' },
  { key: 'source_reference', label: 'Verification source URL' },
  { key: 'verified', label: 'Verified?', type: 'select', options: [{ value: 'false', label: 'No — requires review' }, { value: 'true', label: 'Yes — source checked' }] },
], { provider: 'Unverified provider', domain: 'General', duration: 'Not specified', verified: 'false' },
  async v => api('/api/courses', { method: 'POST', body: { ...v, verified: v.verified === 'true' } }));

// ── Roles ──────────────────────────────────────────────────────────
async function loadRoles() {
  roles = await api('/api/roles');
  $('roleRows').innerHTML = roles.map(r => `
    <tr>
      <td><b>${esc(r.name)}</b></td>
      <td>${esc(r.grade)}</td>
      <td>${r.required_skills.map(x => esc(x.skill) + ' (L' + x.required_level + ')').join(', ') || 'Not mapped'}</td>
      <td>${esc(r.review_status)}</td>
      <td>${r.source_reference ? esc(r.source_reference) : 'Not attached'}</td>
    </tr>
  `).join('') || emptyRow(5, 'No roles defined.');
}

$('addRoleBtn').onclick = () => openForm('Add role definition', [
  { key: 'name', label: 'Role name', required: true },
  { key: 'grade', label: 'Grade / level' },
  { key: 'description', label: 'Role description', type: 'textarea' },
  { key: 'source_reference', label: 'Official role standard URL / reference' },
  { key: 'review_status', label: 'Review status' },
  { key: 'required_skills', label: 'Required skills', type: 'textarea', placeholder: 'Skill A; Skill B' },
], { grade: 'Not specified', review_status: 'Pending review' },
  async v => api('/api/roles', { method: 'POST', body: { ...v, required_skills: (v.required_skills || '').split(/[;|]/).map(s => s.trim()).filter(Boolean) } }));

// ── Neural Network Graph & AI Cadre Copilot ──────────────────────────
let activeNeuralNode = null;

async function renderGraph() {
  try {
    const [graph, allRoles] = await Promise.all([api('/api/graph'), api('/api/roles')]);
    const svg = $('graphSvg');
    if (!svg) return;

    const r = graph.nodes.filter(n => n.type === 'role');
    const s = graph.nodes.filter(n => n.type === 'skill');
    const c = graph.nodes.filter(n => n.type === 'course');

    // Populate Copilot selects
    const roleSelect = $('copilotCurrentRole');
    const targetSelect = $('copilotTargetRole');
    if (roleSelect && targetSelect && (!roleSelect.children.length || !targetSelect.children.length)) {
      const opts = r.map(x => `<option value="${esc(x.label)}">${esc(x.label)}</option>`).join('');
      roleSelect.innerHTML = opts;
      targetSelect.innerHTML = opts;
      if (r.length > 1) targetSelect.selectedIndex = 1;
    }

    // Neural Coordinates (3-Layer Deep Architecture)
    const pos = {};
    const W = 1020, H = 660;
    const xRole = 175, xSkill = 510, xCourse = 825;

    r.forEach((n, i) => pos[n.id] = { x: xRole, y: 70 + i * ((H - 140) / Math.max(r.length - 1, 1)), layer: 1, idx: `x${i+1}` });
    s.forEach((n, i) => pos[n.id] = { x: xSkill, y: 55 + i * ((H - 110) / Math.max(s.length - 1, 1)), layer: 2, idx: `h${i+1}` });
    c.forEach((n, i) => pos[n.id] = { x: xCourse, y: 75 + i * ((H - 150) / Math.max(c.length - 1, 1)), layer: 3, idx: `y${i+1}` });

    let svgHtml = `
      <defs>
        <pattern id="neuralDots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#203328" />
        </pattern>
        <filter id="neuralGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#neuralDots)" opacity="0.6"/>
    `;

    // Layer Headers
    svgHtml += `
      <g class="neural-headers" opacity="0.85">
        <text x="${xRole}" y="32" text-anchor="middle" fill="#2dd4bf" font-size="10" font-weight="800" letter-spacing="2">INPUT LAYER &bull; CADRES</text>
        <text x="${xSkill}" y="32" text-anchor="middle" fill="#fbbf24" font-size="10" font-weight="800" letter-spacing="2">HIDDEN LAYER &bull; COMPETENCIES</text>
        <text x="${xCourse}" y="32" text-anchor="middle" fill="#818cf8" font-size="10" font-weight="800" letter-spacing="2">OUTPUT LAYER &bull; PATHWAYS</text>
      </g>
    `;

    // Render Synapses (Edges)
    for (const e of graph.edges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      const isTeaches = e.type === 'teaches';
      const color = isTeaches ? '#818cf8' : '#2dd4bf';
      const dx = Math.abs(b.x - a.x) * 0.45;
      const pathId = `synapse-${e.from}-${e.to}`;
      svgHtml += `<path class="synapse" id="${pathId}" data-from="${e.from}" data-to="${e.to}"
        d="M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}"
        fill="none" stroke="${color}" stroke-width="1.4" stroke-opacity="0.22" />`;
    }

    // Render Neurons (Nodes)
    const all = [...r, ...s, ...c];
    all.forEach(n => {
      const p = pos[n.id];
      if (!p) return;
      const color = p.layer === 1 ? '#2dd4bf' : p.layer === 2 ? '#fbbf24' : '#818cf8';
      const label = n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label;

      let pillX, pillAnchor, textX;
      if (p.layer === 1) {
        pillX = p.x - 150; textX = p.x - 26; pillAnchor = 'end';
      } else if (p.layer === 2) {
        pillX = p.x - 85; textX = p.x; pillAnchor = 'middle';
      } else {
        pillX = p.x + 24; textX = p.x + 26; pillAnchor = 'start';
      }

      svgHtml += `
        <g class="neuron-node" id="neuron-${n.id}" data-id="${n.id}" data-type="${n.type}" data-label="${esc(n.label)}" data-layer="${p.layer}">
          <!-- Synaptic Glow Halo -->
          <circle class="neuron-halo" cx="${p.x}" cy="${p.y}" r="21" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.3" stroke-width="1" />
          <!-- Neuron Core -->
          <circle class="neuron-core" cx="${p.x}" cy="${p.y}" r="13" fill="${color}" fill-opacity="0.95" stroke="#ffffff" stroke-width="1.2" />
          <!-- Index Glyph -->
          <text cx="${p.x}" cy="${p.y + 3.5}" text-anchor="middle" fill="#0d1511" font-size="8.5" font-weight="800">${p.idx}</text>
          <!-- Label Pill -->
          <g class="neuron-label-group">
            <rect x="${p.layer === 1 ? p.x - 155 : p.layer === 3 ? p.x + 22 : p.x - 70}" y="${p.layer === 2 ? p.y + 16 : p.y - 12}"
              width="${p.layer === 2 ? 140 : 130}" height="24" rx="3"
              fill="#18231d" fill-opacity="0.92" stroke="${color}" stroke-opacity="0.35" stroke-width="0.8" />
            <text x="${p.layer === 1 ? p.x - 90 : p.layer === 3 ? p.x + 87 : p.x}" y="${p.layer === 2 ? p.y + 31 : p.y + 3}"
              text-anchor="middle" fill="#e2e8e0" font-size="9" font-weight="600">${esc(label)}</text>
          </g>
        </g>
      `;
    });

    svg.innerHTML = svgHtml;

    // Neuron Click & Activation Listeners
    svg.querySelectorAll('.neuron-node').forEach(g => {
      const nid = g.dataset.id;
      const ntype = g.dataset.type;
      const nlabel = g.dataset.label;

      g.onclick = () => {
        activateNeuralCircuit(nid, graph, pos);
        if (ntype === 'role') {
          if ($('copilotCurrentRole')) $('copilotCurrentRole').value = nlabel;
          triggerCopilotPathway(nlabel, $('copilotTargetRole')?.value || 'Senior Statistical Officer');
        } else if (ntype === 'skill') {
          triggerCopilotPathway($('copilotCurrentRole')?.value || 'Junior Statistical Officer', $('copilotTargetRole')?.value || 'Senior Statistical Officer', `Focus on learning roadmap for ${nlabel}`);
        }
      };
    });

    // Reset button
    const resetBtn = $('resetNeuralView');
    if (resetBtn) {
      resetBtn.onclick = () => resetNeuralActivation();
    }

    // Set default initial Copilot view if empty
    if ($('copilotRoadmap') && $('copilotRoadmap').querySelector('h3')?.textContent.includes('Select a Cadre')) {
      triggerCopilotPathway('Junior Statistical Officer', 'Senior Statistical Officer');
    }

  } catch (e) {
    console.error('Neural graph render error:', e);
  }
}

function activateNeuralCircuit(targetId, graph, pos) {
  activeNeuralNode = targetId;
  const svg = $('graphSvg');
  if (!svg) return;

  // Find connected nodes and synapses
  const connectedNodes = new Set([targetId]);
  const activeSynapses = new Set();

  // Forward connections
  graph.edges.forEach(e => {
    if (e.from === targetId) {
      activeSynapses.add(`synapse-${e.from}-${e.to}`);
      connectedNodes.add(e.to);
      // Secondary forward (e.g. Role -> Skill -> Course)
      graph.edges.forEach(e2 => {
        if (e2.from === e.to) {
          activeSynapses.add(`synapse-${e2.from}-${e2.to}`);
          connectedNodes.add(e2.to);
        }
      });
    }
  });

  // Backward connections (if skill or course clicked)
  graph.edges.forEach(e => {
    if (e.to === targetId) {
      activeSynapses.add(`synapse-${e.from}-${e.to}`);
      connectedNodes.add(e.from);
      // Secondary backward
      graph.edges.forEach(e2 => {
        if (e2.to === e.from) {
          activeSynapses.add(`synapse-${e2.from}-${e2.to}`);
          connectedNodes.add(e2.from);
        }
      });
    }
  });

  // Update SVG DOM classes
  svg.querySelectorAll('.synapse').forEach(s => {
    const isAct = activeSynapses.has(s.id);
    s.classList.toggle('synapse-firing', isAct);
    s.classList.toggle('dimmed', !isAct);
  });

  svg.querySelectorAll('.neuron-node').forEach(n => {
    const isTarget = n.dataset.id === targetId;
    const isConn = connectedNodes.has(n.dataset.id);
    n.classList.toggle('neuron-firing', isTarget);
    n.classList.toggle('neuron-activated', isConn && !isTarget);
    n.classList.toggle('dimmed', !isConn);
  });
}

function resetNeuralActivation() {
  activeNeuralNode = null;
  const svg = $('graphSvg');
  if (!svg) return;
  svg.querySelectorAll('.synapse').forEach(s => {
    s.classList.remove('synapse-firing', 'dimmed');
  });
  svg.querySelectorAll('.neuron-node').forEach(n => {
    n.classList.remove('neuron-firing', 'neuron-activated', 'dimmed');
  });
}

// ── AI Copilot Pathway & Chat Controller ────────────────────────────
async function triggerCopilotPathway(currentRole, targetRole, query = '') {
  const roadmapEl = $('copilotRoadmap');
  const sourcesEl = $('copilotSourcesArea');
  if (!roadmapEl) return;

  roadmapEl.innerHTML = `
    <div class="cadre-analyzing-box">
      <div class="cadre-pulse-bar"></div>
      <b>Evaluating Cadre Competency Standards…</b>
      <p>Consulting civil service progression frameworks, competency deltas, and verified institutional curricula.</p>
    </div>
  `;
  if (sourcesEl) sourcesEl.innerHTML = '';

  try {
    const res = await api('/api/ai/career-copilot', {
      method: 'POST',
      body: {
        current_role: currentRole,
        target_role: targetRole,
        message: query
      }
    });

    if (res.status === 'success') {
      renderCopilotOutput(res);
    } else {
      roadmapEl.innerHTML = `<p class="error">Advisory Engine: ${esc(res.detail || 'Unable to generate pathway')}</p>`;
    }
  } catch (err) {
    roadmapEl.innerHTML = `<p class="error">Advisory Engine: ${esc(err.message)}</p>`;
  }
}

function renderCopilotOutput(data) {
  const roadmapEl = $('copilotRoadmap');
  const sourcesEl = $('copilotSourcesArea');
  if (!roadmapEl) return;

  // Format markdown in narrative
  let md = data.ai_analysis || '';
  let html = md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/<\/li>\n<li>/g, '</li><li>');

  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  roadmapEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line)">
      <span class="badge ${data.mode === 'live_gemini' ? 'badge-green' : 'badge-blue'}">${data.mode === 'live_gemini' ? 'Gemini Cognitive Engine' : 'Official Cadre Analytics'}</span>
      <small style="color:var(--muted)">Est. Duration: ${esc(data.estimated_duration)}</small>
    </div>
    ${html}
  `;

  // Render Verified Learning Sources
  if (sourcesEl && data.verified_sources?.length) {
    let sHtml = `
      <h4 style="margin:16px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--ink)">
        Verified Official Sources to Learn From:
      </h4>
      <div class="sources-grid">
    `;

    data.verified_sources.forEach(s => {
      sHtml += `
        <div class="source-card">
          <div class="source-card-top">
            <h4>${esc(s.title)}</h4>
            <span class="source-provider">${esc(s.provider)}</span>
          </div>
          <p><b>Focus:</b> ${esc(s.focus)} &bull; <small style="color:var(--muted)">${esc(s.duration)}</small></p>
          <a href="${esc(s.url)}" target="_blank" rel="noreferrer" class="source-link-btn">
            Open Official Resource &rarr;
          </a>
        </div>
      `;
    });
    sHtml += '</div>';
    sourcesEl.innerHTML = sHtml;
  }
}

// Bind Copilot controls
document.addEventListener('DOMContentLoaded', () => {
  initCopilotHandlers();
});

function initCopilotHandlers() {
  const genBtn = $('copilotGenerateBtn');
  if (genBtn) {
    genBtn.onclick = () => {
      const curr = $('copilotCurrentRole')?.value || 'Junior Statistical Officer';
      const targ = $('copilotTargetRole')?.value || 'Senior Statistical Officer';
      triggerCopilotPathway(curr, targ);
    };
  }

  const chatForm = $('copilotChatForm');
  if (chatForm) {
    chatForm.onsubmit = e => {
      e.preventDefault();
      const inp = $('copilotChatInput');
      const q = inp?.value.trim();
      if (!q) return;
      inp.value = '';
      const curr = $('copilotCurrentRole')?.value || 'Junior Statistical Officer';
      const targ = $('copilotTargetRole')?.value || 'Senior Statistical Officer';
      triggerCopilotPathway(curr, targ, q);
    };
  }

  document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      const prompt = chip.dataset.prompt;
      const curr = $('copilotCurrentRole')?.value || 'Junior Statistical Officer';
      const targ = $('copilotTargetRole')?.value || 'Senior Statistical Officer';
      triggerCopilotPathway(curr, targ, prompt);
    };
  });
}

// ── Downloads / Exports ────────────────────────────────────────────
async function download(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json()).detail || 'Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

$('exportOfficers').onclick = () => download('/api/export/officers.csv', 'statintel-officers.csv').catch(e => toast(e.message));
$('reportOfficerCsv').onclick = () => download('/api/export/officers.csv', 'statintel-officers.csv').catch(e => toast(e.message));
$('reportGapCsv').onclick = async () => {
  try {
    const data = await api('/api/gap-analysis');
    const rows = [
      ['skill', 'domain', 'profile_mentions', 'severity_score', 'severity_level', 'mention_ratio', 'source_status'],
      ...data.items.map(x => [x.skill, x.domain, x.profile_mentions, x.severity_score, x.severity_level, x.mention_ratio, x.source_status])
    ];
    const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'statintel-gap-analysis.csv'; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { toast(e.message); }
};
if ($('reportPitchPdf')) {
  $('reportPitchPdf').onclick = () => {
    window.open('/api/export/pitch-dossier.pdf', '_blank');
  };
}

// ── Boot ───────────────────────────────────────────────────────────
(async () => { if (token) await startApp(); })();
