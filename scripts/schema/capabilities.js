function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateCapabilities(payload) {
  const errors = [];

  if (!isObject(payload)) return { ok: false, errors: ['Capabilities must be an object'] };

  if (payload.version !== '1.0') errors.push('capabilities.version must be "1.0"');
  if (typeof payload.mode !== 'string' || payload.mode.trim() === '') errors.push('capabilities.mode must be a non-empty string');

  if (!isObject(payload.backends)) {
    errors.push('capabilities.backends must be an object');
  } else {
    for (const k of ['tracker', 'docs', 'scm', 'tms']) {
      if (typeof payload.backends[k] !== 'string' || payload.backends[k].trim() === '') {
        errors.push(`capabilities.backends.${k} must be a non-empty string`);
      }
    }
  }

  for (const section of ['tracker', 'docs']) {
    if (!isObject(payload[section])) {
      errors.push(`capabilities.${section} must be an object`);
      continue;
    }
    for (const [k, v] of Object.entries(payload[section])) {
      if (typeof v !== 'boolean') errors.push(`capabilities.${section}.${k} must be a boolean`);
    }
  }

  if (payload.tms !== undefined) {
    if (!isObject(payload.tms)) {
      errors.push('capabilities.tms must be an object');
    } else {
      for (const [k, v] of Object.entries(payload.tms)) {
        if (typeof v !== 'boolean') errors.push(`capabilities.tms.${k} must be a boolean`);
      }
    }
  }

  if (payload.workflow !== undefined) {
    if (!isObject(payload.workflow)) {
      errors.push('capabilities.workflow must be an object');
    } else {
      for (const [k, v] of Object.entries(payload.workflow)) {
        if (typeof v !== 'boolean') errors.push(`capabilities.workflow.${k} must be a boolean`);
      }
    }
  }

  if (!isObject(payload.scm)) {
    errors.push('capabilities.scm must be an object');
  } else {
    for (const [k, v] of Object.entries(payload.scm)) {
      if (typeof v !== 'boolean') errors.push(`capabilities.scm.${k} must be a boolean`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateCapabilities };
