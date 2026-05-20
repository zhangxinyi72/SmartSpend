const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

process.env.SMARTSPEND_SKIP_SERVER_START = '1';

const { isPublicStaticFile, parseRequestPathname, resolveStaticFile } = require('../app.js');

const root = path.resolve(__dirname, '..');

test('serves only public UI assets from the repository root', async () => {
    assert.equal(isPublicStaticFile(path.join(root, 'index.html')), true);
    assert.equal(isPublicStaticFile(path.join(root, 'css', 'main.css')), true);
    assert.equal(isPublicStaticFile(path.join(root, 'js', 'api.js')), true);

    assert.equal(isPublicStaticFile(path.join(root, '.env')), false);
    assert.equal(isPublicStaticFile(path.join(root, '.git', 'HEAD')), false);
    assert.equal(isPublicStaticFile(path.join(root, 'app.js')), false);
    assert.equal(isPublicStaticFile(path.join(root, 'package-lock.json')), false);
});

test('resolveStaticFile blocks sensitive repository files', async () => {
    assert.equal(await resolveStaticFile('/'), path.join(root, 'index.html'));
    assert.equal(await resolveStaticFile('/home'), path.join(root, 'home.html'));
    assert.equal(await resolveStaticFile('/css/main.css'), path.join(root, 'css', 'main.css'));

    assert.equal(await resolveStaticFile('/.env'), null);
    assert.equal(await resolveStaticFile('/.git/HEAD'), null);
    assert.equal(await resolveStaticFile('/app.js'), null);
    assert.equal(await resolveStaticFile('/package-lock.json'), null);
});

test('parseRequestPathname rejects malformed encoded paths', () => {
    assert.equal(parseRequestPathname({ url: '/healthz', headers: { host: 'localhost:3001' } }), '/healthz');
    assert.equal(parseRequestPathname({ url: '/%', headers: { host: 'localhost:3001' } }), null);
});
