const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}

function writeMongoMockPreload() {
    const filePath = path.join(os.tmpdir(), `smartspend-mongo-mock-${process.pid}.cjs`);
    fs.writeFileSync(filePath, `
const Module = require('module');
const originalLoad = Module._load;

function createCollection() {
    return {
        createIndex: async () => undefined,
        deleteMany: async () => ({ deletedCount: 0 }),
        deleteOne: async () => ({ deletedCount: 0 }),
        findOne: async () => null,
        updateMany: async () => ({ modifiedCount: 0 })
    };
}

Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'mongodb') {
        return {
            MongoClient: {
                connect: async () => ({
                    close: async () => undefined,
                    db: () => ({
                        command: async () => ({ ok: 1 }),
                        collection: () => createCollection()
                    })
                })
            },
            ObjectId: class ObjectId {
                static isValid() { return true; }
                constructor(value) { this.value = value; }
                toString() { return String(this.value); }
            }
        };
    }

    return originalLoad.apply(this, arguments);
};
`);
    return filePath;
}

function waitForServer(child) {
    return new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => {
            reject(new Error(`Server did not start. Output:\n${output}`));
        }, 5000);

        function onData(chunk) {
            output += chunk.toString();
            if (output.includes('Server is running')) {
                clearTimeout(timeout);
                resolve();
            }
        }

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', code => {
            clearTimeout(timeout);
            reject(new Error(`Server exited before startup with code ${code}. Output:\n${output}`));
        });
    });
}

function requestMalformedPath(port) {
    return requestPathStatus(port, '/%E0%A4%A');
}

function requestPathStatus(port, requestPath) {
    return new Promise((resolve, reject) => {
        const req = http.get(
            {
                host: '127.0.0.1',
                port,
                path: requestPath
            },
            response => {
                response.resume();
                response.on('end', () => resolve(response.statusCode));
            }
        );
        req.on('error', reject);
        req.setTimeout(3000, () => {
            req.destroy(new Error('Timed out waiting for malformed-path response'));
        });
    });
}

test('malformed percent-encoded request paths return 400 instead of crashing the server', async t => {
    const port = await getFreePort();
    const preloadPath = writeMongoMockPreload();
    const child = spawn(process.execPath, ['--require', preloadPath, path.join(__dirname, '..', 'app.js')], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(port),
            MONGO_URL: 'mongodb://mock:27017',
            DB_NAME: 'smartspend_test'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    t.after(() => {
        child.kill();
        fs.rmSync(preloadPath, { force: true });
    });

    await waitForServer(child);

    const statusCode = await requestMalformedPath(port);
    assert.equal(statusCode, 400);

    const healthStatusCode = await requestPathStatus(port, '/healthz');
    assert.equal(healthStatusCode, 200);

    assert.equal(child.exitCode, null);
});
