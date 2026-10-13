'use strict';

/**
 * Reset ONLY local development data: clears backend/data/tickets.json and
 * backend/data/uploads/. Never touches AWS. Usage: npm run reset:demo
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'tickets.json');
const uploadDir = process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads');

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.writeFileSync(dataFile, '[]');
console.log(`Cleared ${dataFile}`);

if (fs.existsSync(uploadDir)) {
  fs.rmSync(uploadDir, { recursive: true, force: true });
  console.log(`Removed ${uploadDir}`);
}
fs.mkdirSync(uploadDir, { recursive: true });
fs.writeFileSync(path.join(uploadDir, '.gitkeep'), '');
console.log('Local demo data reset. Restart the backend if it is running.');
