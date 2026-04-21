import {
  buildDeviceView,
  escapeHtml,
  filterDevices,
  sortDevices,
  summarizeDevices
} from './lib/device-health.mjs';

// Mock data for additional pages
const connectivityData = [
  { deviceId: 'SN-10021', signalStrength: -38, connectionType: 'WiFi 6', packetLoss: 0.1, latency: 12, quality: 'Excellent' },
  { deviceId: 'SN-10022', signalStrength: -67, connectionType: 'WiFi 5', packetLoss: 2.3, latency: 45, quality: 'Fair' },
  { deviceId: 'SN-10408', signalStrength: -82, connectionType: 'WiFi 4', packetLoss: 5.1, latency: 89, quality: 'Poor' },
  { deviceId: 'SN-10877', signalStrength: -41, connectionType: 'WiFi 6', packetLoss: 0.2, latency: 15, quality: 'Excellent' },
  { deviceId: 'SN-10931', signalStrength: -58, connectionType: 'WiFi 5', packetLoss: 1.1, latency: 28, quality: 'Good' },
  { deviceId: 'SN-11002', signalStrength: -45, connectionType: 'WiFi 6', packetLoss: 0.3, latency: 18, quality: 'Excellent' }
];

const firmwareData = [
  { deviceId: 'SN-10021', currentVersion: '4.8.2', targetVersion: '4.8.2', updateAvailable: false, lastUpdate: '2026-03-28', status: 'Current' },
  { deviceId: 'SN-10022', currentVersion: '4.8.2', targetVersion: '4.8.2', updateAvailable: false, lastUpdate: '2026-03-25', status: 'Current' },
  { deviceId: 'SN-10408', currentVersion: '4.8.1', targetVersion: '4.8.2', updateAvailable: true, lastUpdate: '2026-03-10', status: 'Update available' },
  { deviceId: 'SN-10877', currentVersion: '4.8.2', targetVersion: '4.8.2', updateAvailable: false, lastUpdate: '2026-03-29', status: 'Current' },
  { deviceId: 'SN-10931', currentVersion: '4.7.9', targetVersion: '4.8.2', updateAvailable: true, lastUpdate: '2026-02-15', status: 'Outdated' },
  { deviceId: 'SN-11002', currentVersion: '4.8.0', targetVersion: '4.8.2', updateAvailable: true, lastUpdate: '2026-03-20', status: 'Update available' }
];

const deliveryData = [
  { orderId: 'ORD-78421', deviceId: 'SN-11205', customer: 'Sarah M.', region: 'Minneapolis', status: 'Pending activation', progress: 0 },
  { orderId: 'ORD-78422', deviceId: 'SN-11206', customer: 'James K.', region: 'Dallas', status: 'In setup', progress: 45 },
  { orderId: 'ORD-78423', deviceId: 'SN-11207', customer: 'Maria G.', region: 'Phoenix', status: 'In setup', progress: 70 },
  { orderId: 'ORD-78424', deviceId: 'SN-11208', customer: 'Robert T.', region: 'Chicago', status: 'Completed', progress: 100 },
  { orderId: 'ORD-78425', deviceId: 'SN-11209', customer: 'Emily W.', region: 'Minneapolis', status: 'Completed', progress: 100 }
];

function deviceActionMarkup(action, id, label, className = 'action-btn') {
  return `<button class="${className}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" data-testid="action-${escapeHtml(action)}-${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

// Render functions for Incident Queue page
function renderSummary(summaryRoot, summary) {
  const cards = [
    ['Connected', summary.connected, 'Beds reporting normally'],
    ['Reconnecting', summary.reconnecting, 'Pending recovery attempts'],
    ['Offline', summary.offline, 'Beds needing manual review'],
    ['Open incidents', summary.incidents, 'Visible in the operations queue']
  ];

  summaryRoot.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function renderSignals(signalsRoot, devices) {
  const reconnecting = devices.filter((device) => device.status === 'reconnecting').length;
  const connected = devices.filter((device) => device.status === 'connected').length;
  const oldestIncident = devices
    .filter((device) => device.isIncident)
    .reduce((max, device) => Math.max(max, device.stateDurationMinutes), 0);

  const signals = [
    ['Support posture', 'Watch', 'Connectivity guidance is stable but escalation is still manual.'],
    ['Connected tonight', `${connected} beds`, 'Healthy devices continue streaming sleep-session data.'],
    ['Reconnect backlog', `${reconnecting} beds`, 'These devices are visible, but not auto-prioritized yet.'],
    ['Oldest open incident', `${oldestIncident} min`, 'Useful anchor for the future escalation threshold.']
  ];

  signalsRoot.innerHTML = signals
    .map(
      ([label, value, note]) => `
        <article class="signal-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function statusClass(status) {
  return `status-pill status-${status}`;
}

function rowClass(device) {
  const classes = ['fleet-row'];
  if (device.status === 'offline') classes.push('fleet-row-offline');
  if (device.status === 'reconnecting') classes.push('fleet-row-reconnecting');
  if (device.isEscalationCandidate) classes.push('fleet-row-stuck');
  return classes.join(' ');
}

function renderRows(rowsRoot, devices) {
  rowsRoot.innerHTML = devices
    .map(
      (device) => `
        <tr class="${rowClass(device)}" data-testid="incident-row-${escapeHtml(device.deviceId)}">
          <td>
            <div class="device-cell">
              <strong>${escapeHtml(device.deviceId)}</strong>
              <span>${escapeHtml(device.bedLabel)}</span>
            </div>
          </td>
          <td>${escapeHtml(device.region)}</td>
          <td><span class="${statusClass(device.status)}">${escapeHtml(device.stateLabel)}</span></td>
          <td class="metric-cell">${escapeHtml(device.heartbeatLabel)}</td>
          <td class="metric-cell">
            <div class="duration-cell">
              <span>${escapeHtml(device.durationLabel)}</span>
              ${device.isEscalationCandidate ? '<span class="stuck-badge">!</span>' : ''}
            </div>
          </td>
          <td>${escapeHtml(device.queueLabel)}</td>
          <td>
            ${
              device.isEscalationCandidate
                ? deviceActionMarkup('escalate-manual', device.deviceId, 'Manual Escalate', 'action-btn btn-escalate')
                : deviceActionMarkup('view-details', device.deviceId, 'View Details')
            }
          </td>
        </tr>
      `
    )
    .join('');
}

// Render functions for Connectivity Health page
function renderConnectivitySummary(root) {
  const excellent = connectivityData.filter((d) => d.quality === 'Excellent').length;
  const good = connectivityData.filter((d) => d.quality === 'Good').length;
  const fair = connectivityData.filter((d) => d.quality === 'Fair').length;
  const poor = connectivityData.filter((d) => d.quality === 'Poor').length;

  const cards = [
    ['Excellent signal', excellent, 'Devices with optimal connection'],
    ['Good signal', good, 'Acceptable connection quality'],
    ['Fair signal', fair, 'May experience intermittent issues'],
    ['Poor signal', poor, 'Requires attention']
  ];

  root.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function renderConnectivitySignals(root) {
  const avgLatency = Math.round(connectivityData.reduce((sum, d) => sum + d.latency, 0) / connectivityData.length);
  const avgPacketLoss = (connectivityData.reduce((sum, d) => sum + d.packetLoss, 0) / connectivityData.length).toFixed(1);
  const wifi6Count = connectivityData.filter((d) => d.connectionType === 'WiFi 6').length;

  const signals = [
    ['Network health', 'Stable', `Average latency ${avgLatency}ms across the fleet`],
    ['Packet loss', `${avgPacketLoss}%`, 'Within acceptable threshold (<3%)'],
    ['WiFi 6 adoption', `${wifi6Count} devices`, 'Modern routers providing better coverage'],
    ['Attention needed', `${connectivityData.filter((d) => d.quality === 'Poor').length} devices`, 'Signal boosters recommended']
  ];

  root.innerHTML = signals
    .map(
      ([label, value, note]) => `
        <article class="signal-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function qualityClass(quality) {
  return `status-pill status-${quality.toLowerCase()}`;
}

function renderConnectivityRows(root) {
  root.innerHTML = connectivityData
    .map(
      (data) => `
        <tr data-testid="connectivity-row-${escapeHtml(data.deviceId)}">
          <td>
            <div class="device-cell">
              <strong>${escapeHtml(data.deviceId)}</strong>
            </div>
          </td>
          <td class="metric-cell">${data.signalStrength} dBm</td>
          <td>${escapeHtml(data.connectionType)}</td>
          <td class="metric-cell">${data.packetLoss}%</td>
          <td class="metric-cell">${data.latency}ms</td>
          <td><span class="${qualityClass(data.quality)}">${escapeHtml(data.quality)}</span></td>
        </tr>
      `
    )
    .join('');
}

function renderConnectivity(ui) {
  renderConnectivitySummary(ui.connectivitySummaryRoot);
  renderConnectivitySignals(ui.connectivitySignalsRoot);
  renderConnectivityRows(ui.connectivityRowsRoot);
}

// Render functions for Firmware Readiness page
function renderFirmwareSummary(root) {
  const current = firmwareData.filter((d) => d.status === 'Current').length;
  const updateAvailable = firmwareData.filter((d) => d.status === 'Update available').length;
  const outdated = firmwareData.filter((d) => d.status === 'Outdated').length;
  const adoptionRate = Math.round((current / firmwareData.length) * 100);

  const cards = [
    ['Current version', current, 'Devices on latest firmware'],
    ['Update available', updateAvailable, 'Ready for scheduled update'],
    ['Outdated', outdated, 'Requires manual intervention'],
    ['Adoption rate', `${adoptionRate}%`, 'Fleet update progress']
  ];

  root.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function renderFirmwareSignals(root) {
  const latestVersion = '4.8.2';
  const needsUpdate = firmwareData.filter((d) => d.updateAvailable).length;
  const criticalUpdates = firmwareData.filter((d) => d.status === 'Outdated').length;

  const signals = [
    ['Latest version', latestVersion, 'Stable release with connectivity improvements'],
    ['Pending updates', `${needsUpdate} devices`, 'Scheduled for next maintenance window'],
    ['Critical updates', `${criticalUpdates} devices`, 'Version 4.7.x requires urgent attention'],
    ['Update success rate', '98.2%', 'Rollback available for failed updates']
  ];

  root.innerHTML = signals
    .map(
      ([label, value, note]) => `
        <article class="signal-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function statusBadgeClass(status) {
  if (status === 'Current') return 'status-pill status-connected';
  if (status === 'Update available') return 'status-pill status-reconnecting';
  return 'status-pill status-offline';
}

function renderFirmwareRows(root) {
  root.innerHTML = firmwareData
    .map(
      (data) => `
        <tr data-testid="firmware-row-${escapeHtml(data.deviceId)}">
          <td>
            <div class="device-cell">
              <strong>${escapeHtml(data.deviceId)}</strong>
            </div>
          </td>
          <td>${escapeHtml(data.currentVersion)}</td>
          <td>${escapeHtml(data.targetVersion)}</td>
          <td>${data.updateAvailable ? '✓ Available' : '—'}</td>
          <td>${escapeHtml(data.lastUpdate)}</td>
          <td><span class="${statusBadgeClass(data.status)}">${escapeHtml(data.status)}</span></td>
          <td>
            ${data.updateAvailable
              ? deviceActionMarkup('schedule-update', data.deviceId, 'Schedule Update', 'action-btn btn-escalate')
              : deviceActionMarkup('view-details', data.deviceId, 'View Details')
            }
          </td>
        </tr>
      `
    )
    .join('');
}

function renderFirmware(ui) {
  renderFirmwareSummary(ui.firmwareSummaryRoot);
  renderFirmwareSignals(ui.firmwareSignalsRoot);
  renderFirmwareRows(ui.firmwareRowsRoot);
}

// Render functions for Delivery Support page
function renderDeliverySummary(root) {
  const pending = deliveryData.filter((d) => d.status === 'Pending activation').length;
  const inSetup = deliveryData.filter((d) => d.status === 'In setup').length;
  const completed = deliveryData.filter((d) => d.status === 'Completed').length;
  const avgProgress = Math.round(deliveryData.reduce((sum, d) => sum + d.progress, 0) / deliveryData.length);

  const cards = [
    ['Pending activation', pending, 'Awaiting customer setup'],
    ['In setup', inSetup, 'Active installation in progress'],
    ['Completed', completed, 'Successfully activated'],
    ['Avg progress', `${avgProgress}%`, 'Overall setup completion']
  ];

  root.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="summary-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function renderDeliverySignals(root) {
  const completedToday = deliveryData.filter((d) => d.status === 'Completed').length;
  const issues = deliveryData.filter((d) => d.progress < 30 && d.status === 'In setup').length;

  const signals = [
    ['Today\'s activations', `${completedToday} completed`, 'On track with delivery schedule'],
    ['Setup issues', `${issues} stalled`, 'Customers may need support call'],
    ['Avg setup time', '12 min', 'Within target of 15 minutes'],
    ['Support tickets', '2 open', 'Connectivity configuration help']
  ];

  root.innerHTML = signals
    .map(
      ([label, value, note]) => `
        <article class="signal-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `
    )
    .join('');
}

function deliveryStatusClass(status) {
  if (status === 'Completed') return 'status-pill status-connected';
  if (status === 'In setup') return 'status-pill status-reconnecting';
  return 'status-pill status-offline';
}

function renderDeliveryRows(root) {
  root.innerHTML = deliveryData
    .map(
      (data) => `
        <tr data-testid="delivery-row-${escapeHtml(data.orderId)}">
          <td>
            <div class="device-cell">
              <strong>${escapeHtml(data.orderId)}</strong>
            </div>
          </td>
          <td>${escapeHtml(data.deviceId)}</td>
          <td>${escapeHtml(data.customer)}</td>
          <td>${escapeHtml(data.region)}</td>
          <td><span class="${deliveryStatusClass(data.status)}">${escapeHtml(data.status)}</span></td>
          <td>
            <div class="duration-cell">
              <div style="width: 60px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${data.progress}%; height: 100%; background: ${data.progress === 100 ? '#38a169' : '#004b8c'};"></div>
              </div>
              <span style="margin-left: 8px;">${data.progress}%</span>
            </div>
          </td>
          <td>
            ${data.status === 'Pending activation'
              ? deviceActionMarkup('start-activation', data.orderId, 'Start Setup', 'action-btn btn-escalate')
              : deviceActionMarkup('view-details', data.orderId, 'View Details')
            }
          </td>
        </tr>
      `
    )
    .join('');
}

function renderDelivery(ui) {
  renderDeliverySummary(ui.deliverySummaryRoot);
  renderDeliverySignals(ui.deliverySignalsRoot);
  renderDeliveryRows(ui.deliveryRowsRoot);
}

// Render functions for Incident Queue page
function render(ui, devices, currentFilter) {
  renderSummary(ui.summaryRoot, summarizeDevices(devices));
  renderSignals(ui.signalsRoot, devices);
  const visible = sortDevices(filterDevices(devices, currentFilter));
  renderRows(ui.rowsRoot, visible);
}

function createUi(doc) {
  return {
    summaryRoot: doc.querySelector('#summary'),
    signalsRoot: doc.querySelector('#signals'),
    rowsRoot: doc.querySelector('#fleetRows'),
    filterRoot: doc.querySelector('#stateFilter'),
    pageIncident: doc.querySelector('#page-incident'),
    pageConnectivity: doc.querySelector('#page-connectivity'),
    pageFirmware: doc.querySelector('#page-firmware'),
    pageDelivery: doc.querySelector('#page-delivery'),
    navLinks: Array.from(doc.querySelectorAll('.sidebar-nav .nav-item')),
    connectivitySummaryRoot: doc.getElementById('connectivitySummary'),
    connectivitySignalsRoot: doc.getElementById('connectivitySignals'),
    connectivityRowsRoot: doc.getElementById('connectivityRows'),
    firmwareSummaryRoot: doc.getElementById('firmwareSummary'),
    firmwareSignalsRoot: doc.getElementById('firmwareSignals'),
    firmwareRowsRoot: doc.getElementById('firmwareRows'),
    deliverySummaryRoot: doc.getElementById('deliverySummary'),
    deliverySignalsRoot: doc.getElementById('deliverySignals'),
    deliveryRowsRoot: doc.getElementById('deliveryRows')
  };
}

export function navigateToPage(page, ui) {
  if (ui.pageIncident) ui.pageIncident.hidden = true;
  if (ui.pageConnectivity) ui.pageConnectivity.hidden = true;
  if (ui.pageFirmware) ui.pageFirmware.hidden = true;
  if (ui.pageDelivery) ui.pageDelivery.hidden = true;

  if (page === 'incident') {
    if (ui.pageIncident) ui.pageIncident.hidden = false;
  } else if (page === 'connectivity') {
    ui.pageConnectivity.hidden = false;
    renderConnectivity(ui);
  } else if (page === 'firmware') {
    ui.pageFirmware.hidden = false;
    renderFirmware(ui);
  } else if (page === 'delivery') {
    ui.pageDelivery.hidden = false;
    renderDelivery(ui);
  }

  ui.navLinks.forEach((link) => {
    link.classList.remove('nav-item-active');
    if (link.getAttribute('data-page') === page) {
      link.classList.add('nav-item-active');
    }
  });
}

export function handleAction(action, id, notify = globalThis.alert) {
  if (action === 'escalate-manual') {
    notify(
      `Manual Escalation triggered for ${id}.\n\nThis is a demonstration of the current manual process. The Delivery OS workflow will automate this threshold behavior.`
    );
    return;
  }

  if (action === 'schedule-update') {
    notify(`Update scheduled for ${id}.\n\nThis will deploy firmware v4.8.2 during the next maintenance window.`);
    return;
  }

  if (action === 'start-activation') {
    notify(`Activation started for order ${id}.\n\nGuided setup flow will begin for the customer.`);
    return;
  }

  if (action === 'view-details') {
    notify(`Viewing details for ${id}.\n\nThis would open a detailed view with device history, diagnostics, and support options.`);
  }
}

function bindActions(doc, notify = globalThis.alert) {
  doc.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    handleAction(button.dataset.action, button.dataset.id, notify);
  });
}

export async function initApp(doc = document, fetchImpl = fetch) {
  const ui = createUi(doc);
  const response = await fetchImpl('/api/devices');
  const allDevices = (await response.json()).map(buildDeviceView);

  render(ui, allDevices, ui.filterRoot.value);

  ui.filterRoot.addEventListener('change', () => {
    render(ui, allDevices, ui.filterRoot.value);
  });

  ui.navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      if (page) {
        navigateToPage(page, ui);
      }
    });
  });

  bindActions(doc);

  return { ui, allDevices };
}

if (typeof document !== 'undefined') {
  initApp(document, globalThis.fetch)
    .catch((error) => {
      const rowsRoot = document.querySelector('#fleetRows');
      if (rowsRoot) {
        rowsRoot.innerHTML =
          `<tr><td colspan="7">Failed to load demo data: ${escapeHtml(error.message)}</td></tr>`;
      }
    });
}
