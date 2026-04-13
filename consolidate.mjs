import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

const canonicalFiles = [
  'styles.css',
  'app.js'
];

canonicalFiles.forEach((file) => {
  const filePath = path.join(rootDir, file);

  if (fs.existsSync(filePath)) {
    console.log(`Verified canonical file: ${file}`);
  } else {
    console.error(`Missing canonical file: ${file}`);
  }
});
