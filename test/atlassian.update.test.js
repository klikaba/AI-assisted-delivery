const test = require('node:test');
const assert = require('node:assert/strict');

const atlassian = require('../scripts/agency/backends/atlassian');

test('coerceAdfDoc preserves serialized ADF documents', () => {
  const raw = JSON.stringify({
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Problem: demo regression' }]
      }
    ]
  });

  const doc = atlassian.__private.coerceAdfDoc(raw);
  assert.equal(doc.type, 'doc');
  assert.equal(doc.version, 1);
  assert.equal(doc.content[0].type, 'paragraph');
  assert.equal(doc.content[0].content[0].text, 'Problem: demo regression');
});

test('coerceAdfDoc wraps plain text descriptions as ADF', () => {
  const doc = atlassian.__private.coerceAdfDoc('Plain description');
  assert.equal(doc.type, 'doc');
  assert.equal(doc.content[0].type, 'paragraph');
  assert.equal(doc.content[0].content[0].text, 'Plain description');
});

test('normalizeIssue returns readable text body from Jira ADF description', () => {
  const item = atlassian.__private.normalizeIssue('https://example.atlassian.net', {
    id: '10001',
    key: 'SCRUM-7',
    fields: {
      summary: 'Readable description test',
      labels: ['ai-state:ready-for-plan'],
      status: { name: 'Selected For Development' },
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Problem: reconnect escalation is manual.' }]
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First AC' }]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  });

  assert.equal(item.body, 'Problem: reconnect escalation is manual.\nFirst AC');
});
