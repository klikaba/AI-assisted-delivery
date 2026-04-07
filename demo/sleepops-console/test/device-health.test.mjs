import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeviceView,
  escapeHtml,
  filterDevices,
  sortDevices,
  summarizeDevices
} from '../public/lib/device-health.mjs';

const devices = [
  {
    deviceId: 'SN-1',
    bedLabel: 'Left',
    region: 'Minneapolis',
    firmware: '4.8.2',
    status: 'connected',
    lastHeartbeatMinutes: 1,
    stateDurationMinutes: 120,
    incidentOwner: null,
    sleepSession: 'active'
  },
  {
    deviceId: 'SN-2',
    bedLabel: 'Right',
    region: 'Minneapolis',
    firmware: '4.8.2',
    status: 'reconnecting',
    lastHeartbeatMinutes: 17,
    stateDurationMinutes: 20,
    incidentOwner: 'Ops Queue',
    sleepSession: 'buffering'
  },
  {
    deviceId: 'SN-3',
    bedLabel: 'Guest',
    region: 'Dallas',
    firmware: '4.8.1',
    status: 'offline',
    lastHeartbeatMinutes: 55,
    stateDurationMinutes: 55,
    incidentOwner: 'Ops Queue',
    sleepSession: 'not-reporting'
  }
].map(buildDeviceView);

test('summarizeDevices counts each fleet state and incident volume', () => {
  assert.deepEqual(summarizeDevices(devices), {
    connected: 1,
    reconnecting: 1,
    offline: 1,
    incidents: 2
  });
});

test('filterDevices returns only incident rows when requested', () => {
  const filtered = filterDevices(devices, 'incidents');
  assert.deepEqual(
    filtered.map((device) => device.deviceId),
    ['SN-2', 'SN-3']
  );
});

test('sortDevices prioritizes incident rows and longer durations first', () => {
  const sorted = sortDevices(devices);
  assert.deepEqual(
    sorted.map((device) => device.deviceId),
    ['SN-3', 'SN-2', 'SN-1']
  );
});

test('escapeHtml neutralizes characters used for markup injection', () => {
  assert.equal(escapeHtml('<SN-1 & "alpha">'), '&lt;SN-1 &amp; &quot;alpha&quot;&gt;');
});
