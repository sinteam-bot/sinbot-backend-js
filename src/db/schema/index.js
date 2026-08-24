const pgSchema = require('./pg.js');

module.exports = {
    ...pgSchema,
    schema: pgSchema,
    pgSchema
};
