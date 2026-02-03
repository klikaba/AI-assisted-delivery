/**
 * Plan artifact "schema" v1.0 validator (no external deps).
 *
 * We intentionally keep this minimal and strict. The goal is to prevent silent
 * drift in what the Planning flow produces and what downstream agents expect.
 */

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validatePlan(plan) {
  const errors = [];

  if (!isObject(plan)) {
    return { ok: false, errors: ['Plan must be an object'] };
  }

  if (plan.version !== '1.0') {
    errors.push('plan.version must be "1.0"');
  }

  if (!isObject(plan.ticket)) {
    errors.push('plan.ticket must be an object');
  } else {
    if (typeof plan.ticket.id !== 'string' || plan.ticket.id.trim() === '') {
      errors.push('plan.ticket.id must be a non-empty string');
    }
    if (plan.ticket.key !== null && plan.ticket.key !== undefined && typeof plan.ticket.key !== 'string') {
      errors.push('plan.ticket.key must be a string, null, or undefined');
    }
    if (typeof plan.ticket.title !== 'string') {
      errors.push('plan.ticket.title must be a string');
    }
    if (plan.ticket.url !== null && plan.ticket.url !== undefined && typeof plan.ticket.url !== 'string') {
      errors.push('plan.ticket.url must be a string, null, or undefined');
    }
  }

  if (!Array.isArray(plan.acceptanceCriteria)) errors.push('plan.acceptanceCriteria must be an array');
  if (!Array.isArray(plan.filesToTouch)) errors.push('plan.filesToTouch must be an array');
  if (!Array.isArray(plan.steps)) errors.push('plan.steps must be an array');

  if (Array.isArray(plan.steps)) {
    for (let i = 0; i < plan.steps.length; i += 1) {
      const step = plan.steps[i];
      if (!isObject(step)) {
        errors.push(`plan.steps[${i}] must be an object`);
        continue;
      }
      if (typeof step.id !== 'string' || step.id.trim() === '') errors.push(`plan.steps[${i}].id must be a non-empty string`);
      if (typeof step.description !== 'string') errors.push(`plan.steps[${i}].description must be a string`);
      if (!Array.isArray(step.acRefs)) errors.push(`plan.steps[${i}].acRefs must be an array`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validatePlan };

