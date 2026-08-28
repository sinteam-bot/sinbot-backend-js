const { rawClient } = require('../../src/db/index.js');

async function ensureTestDbReady() {
    if (rawClient && rawClient.ready) {
        await rawClient.ready;
    }
}

module.exports = { ensureTestDbReady };
