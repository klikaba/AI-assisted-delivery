import test from 'node:test';
import assert from 'node:assert/strict';

import { handleAction, navigateToPage } from '../public/app.mjs';

function createNavLink(page) {
  const classes = new Set();

  return {
    getAttribute(name) {
      return name === 'data-page' ? page : null;
    },
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    }
  };
}

test('navigateToPage toggles page visibility and active navigation state', () => {
  let renderedFirmware = 0;
  const incident = { hidden: false };
  const connectivity = { hidden: true };
  const firmware = { hidden: true };
  const delivery = { hidden: true };
  const incidentLink = createNavLink('incident');
  const firmwareLink = createNavLink('firmware');
  const deliveryLink = createNavLink('delivery');

  const ui = {
    pageIncident: incident,
    pageConnectivity: connectivity,
    pageFirmware: firmware,
    pageDelivery: delivery,
    navLinks: [incidentLink, firmwareLink, deliveryLink],
    firmwareSummaryRoot: { innerHTML: '' },
    firmwareSignalsRoot: { innerHTML: '' },
    firmwareRowsRoot: { innerHTML: '' }
  };

  const originalInnerHtml = Object.getOwnPropertyDescriptor(ui.firmwareRowsRoot, 'innerHTML');
  Object.defineProperty(ui.firmwareRowsRoot, 'innerHTML', {
    get() {
      return renderedFirmware;
    },
    set() {
      renderedFirmware += 1;
    }
  });

  navigateToPage('firmware', ui);

  assert.equal(incident.hidden, true);
  assert.equal(connectivity.hidden, true);
  assert.equal(firmware.hidden, false);
  assert.equal(delivery.hidden, true);
  assert.equal(firmwareLink.classList.contains('nav-item-active'), true);
  assert.equal(incidentLink.classList.contains('nav-item-active'), false);
  assert.ok(renderedFirmware > 0);

  if (originalInnerHtml) {
    Object.defineProperty(ui.firmwareRowsRoot, 'innerHTML', originalInnerHtml);
  }
});

test('handleAction sends the expected notification copy', () => {
  const messages = [];
  const notify = (message) => {
    messages.push(message);
  };

  handleAction('escalate-manual', "SN-10'022", notify);
  handleAction('schedule-update', 'SN-10408', notify);
  handleAction('start-activation', 'ORD-78421', notify);
  handleAction('view-details', 'SN-10021', notify);

  assert.equal(messages.length, 4);
  assert.match(messages[0], /Manual Escalation triggered for SN-10'022/);
  assert.match(messages[1], /Update scheduled for SN-10408/);
  assert.match(messages[2], /Activation started for order ORD-78421/);
  assert.match(messages[3], /Viewing details for SN-10021/);
});
