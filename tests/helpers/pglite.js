const db = require('../../src/db/index.js');

async function ensureTestDbReady() {
    if (db && db.ready) {
        await db.ready;
    }
}

module.exports = { ensureTestDbReady };


