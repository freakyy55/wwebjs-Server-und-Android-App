require('dotenv').config();
const db = require('../src/db');

db.migrate();
db.resetDatabase();
console.log(`Database reset: ${db.dbFile}`);
