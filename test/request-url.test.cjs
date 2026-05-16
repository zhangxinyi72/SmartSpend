'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRequestUrl } = require('../request-url.cjs');

test('parseRequestUrl decodes valid request paths', () => {
    const parsed = parseRequestUrl('/budget%20planner?category=Food', 'example.test', 3001);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.pathname, '/budget planner');
    assert.equal(parsed.requestUrl.searchParams.get('category'), 'Food');
});

test('parseRequestUrl rejects malformed percent-encoded paths', () => {
    const parsed = parseRequestUrl('/api/expenses/%E0%A4%A', 'example.test', 3001);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, 'Malformed request URL path');
});
