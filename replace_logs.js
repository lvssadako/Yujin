const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, process.argv[2] || 'events');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (content.includes('console.log') || content.includes('console.warn') || content.includes('console.error')) {
    changed = true;
    
    // Add logger require if not present
    if (!content.includes('const logger = require(')) {
      content = `const logger = require('../src/utils/logger');\n` + content;
    }

    // Replace logs with regex that captures the arguments
    content = content.replace(/console\.log\(([\s\S]*?)\);?/g, 'logger.info($1);');
    content = content.replace(/console\.warn\(([\s\S]*?)\);?/g, 'logger.warn($1);');
    content = content.replace(/console\.error\(([\s\S]*?)\);?/g, 'logger.error($1);');
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.js')) {
      processFile(fullPath);
    }
  }
}

walk(targetDir);
console.log('Done!');
