export const INCIDENT_STATUSES = new Set(['offline', 'reconnecting']);

function toSentenceCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildDeviceView(device) {
  const isIncident = INCIDENT_STATUSES.has(device.status);
  const isEscalationCandidate = device.status === 'reconnecting' && device.stateDurationMinutes >= 15;

  return {
    ...device,
    isIncident,
    isEscalationCandidate,
    stateLabel: toSentenceCase(device.status),
    heartbeatLabel: `${device.lastHeartbeatMinutes} min ago`,
    durationLabel: `${device.stateDurationMinutes} min`,
    queueLabel: device.incidentOwner || 'Unassigned'
  };
}

export function summarizeDevices(devices) {
  return devices.reduce(
    (summary, device) => {
      if (device.status === 'connected') summary.connected += 1;
      if (device.status === 'reconnecting') summary.reconnecting += 1;
      if (device.status === 'offline') summary.offline += 1;
      if (INCIDENT_STATUSES.has(device.status)) summary.incidents += 1;
      return summary;
    },
    { connected: 0, reconnecting: 0, offline: 0, incidents: 0 }
  );
}

export function filterDevices(devices, filter) {
  if (!filter || filter === 'all') return devices;
  if (filter === 'incidents') return devices.filter((device) => device.isIncident);
  return devices.filter((device) => device.status === filter);
}

export function sortDevices(devices) {
  return [...devices].sort((left, right) => {
    if (left.isIncident !== right.isIncident) return left.isIncident ? -1 : 1;
    return right.stateDurationMinutes - left.stateDurationMinutes;
  });
}
