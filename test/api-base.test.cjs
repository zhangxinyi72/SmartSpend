const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApiModule(pageUrl, storedApiBase) {
    const storage = new Map();
    if (storedApiBase) {
        storage.set('SMARTSPEND_API_BASE_URL', storedApiBase);
    }

    const location = new URL(pageUrl);
    location.href = pageUrl;

    const window = {
        location,
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
            removeItem(key) {
                storage.delete(key);
            }
        },
        history: {
            replaceState(_state, _title, nextUrl) {
                location.href = new URL(nextUrl, location.origin).href;
            }
        }
    };

    const sourcePath = path.join(__dirname, '..', 'js', 'api.js');
    const source = fs.readFileSync(sourcePath, 'utf8')
        .replace("import { clearAuthSession, getStoredToken, getCategoryColor } from './utils.js';", [
            'const clearAuthSession = () => {};',
            "const getStoredToken = () => 'stored-token';",
            "const getCategoryColor = () => '#000';"
        ].join('\n'))
        .replace(/export\s+(async\s+function|function)\s+/g, '$1 ')
        .replace(/export\s+\{\s*getBaseUrl\s*\};/g, '');

    const context = {
        window,
        URL,
        URLSearchParams,
        localStorage: window.localStorage,
        console
    };
    const moduleContext = {
        ...context,
        module: { exports: {} }
    };
    vm.runInNewContext(`${source}\nmodule.exports = { getBaseUrl };`, moduleContext);
    return { ...moduleContext.module.exports, storage, window };
}

test('ignores apiBase query overrides to untrusted cross-origin hosts', () => {
    const { getBaseUrl, storage } = loadApiModule(
        'https://app.smartspend.example/home.html?apiBase=https%3A%2F%2Fattacker.example'
    );

    assert.equal(getBaseUrl(), 'https://app.smartspend.example');
    assert.equal(storage.get('SMARTSPEND_API_BASE_URL'), undefined);
});

test('allows apiBase query overrides for the documented LAN backend workflow', () => {
    const { getBaseUrl, storage } = loadApiModule(
        'http://localhost:5500/home.html?apiBase=http%3A%2F%2F192.168.1.10%3A3001'
    );

    assert.equal(getBaseUrl(), 'http://192.168.1.10:3001');
    assert.equal(storage.get('SMARTSPEND_API_BASE_URL'), 'http://192.168.1.10:3001');
});
