const assert = require('assert');
const Module = require('module');
const test = require('node:test');

function createMockMongoModule() {
    return {
        MongoClient: {
            connect: () => new Promise(() => {})
        },
        ObjectId: class MockObjectId {
            static isValid() {
                return true;
            }

            constructor(value) {
                this.value = value;
            }

            toString() {
                return String(this.value);
            }
        }
    };
}

function loadHttpHandlerWithMocks() {
    const originalLoad = Module._load;
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    let capturedHandler = null;

    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'dotenv') {
            return { config: () => ({ parsed: {} }) };
        }

        if (request === 'http') {
            return {
                createServer(handler) {
                    capturedHandler = handler;
                    return {
                        listen(_port, onListening) {
                            if (typeof onListening === 'function') {
                                onListening();
                            }
                            return this;
                        },
                        on() {
                            return this;
                        }
                    };
                }
            };
        }

        if (request === 'mongodb') {
            return createMockMongoModule();
        }

        if (request === 'nodemailer') {
            return {
                createTransport: () => ({
                    sendMail: async () => ({})
                })
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        delete require.cache[require.resolve('../app.js')];
        require('../app.js');
    } finally {
        Module._load = originalLoad;
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    }

    assert.equal(typeof capturedHandler, 'function');
    return capturedHandler;
}

function createResponseRecorder() {
    return {
        statusCode: null,
        headers: null,
        body: '',
        writeHead(statusCode, headers) {
            this.statusCode = statusCode;
            this.headers = headers;
        },
        end(chunk = '') {
            this.body += chunk;
        }
    };
}

test('malformed percent-encoded paths return 400 instead of crashing the server', () => {
    const handler = loadHttpHandlerWithMocks();
    const response = createResponseRecorder();

    assert.doesNotThrow(() => {
        handler({
            method: 'GET',
            url: '/%E0%A4%A',
            headers: { host: 'localhost:3001' }
        }, response);
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error: 'Malformed request URL' });
});
