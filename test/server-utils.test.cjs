const assert = require('assert/strict');

const { decodeRequestPathname } = require('../server-utils.cjs');

assert.equal(decodeRequestPathname('/api/expenses'), '/api/expenses');
assert.equal(decodeRequestPathname('/expense%20report'), '/expense report');
assert.equal(decodeRequestPathname('/bad%'), null);
assert.equal(decodeRequestPathname('/bad%E0%A4%A'), null);

console.log('server-utils tests passed');
