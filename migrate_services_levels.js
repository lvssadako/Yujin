const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'commands');
const eventsDir = path.join(__dirname, 'src', 'events');
const prefixDir = path.join(__dirname, 'src', 'prefixCommands');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace utils/levelStore with services/level
  const levelPattern1 = /require\(['"]\.\.\/\.\.\/\.\.\/utils\/levelStore['"]\)/g;
  if (levelPattern1.test(content)) {
    content = content.replace(levelPattern1, "require('../../../services/level').levelService");
    changed = true;
  }
  
  const levelPattern2 = /require\(['"]\.\.\/\.\.\/utils\/levelStore['"]\)/g;
  if (levelPattern2.test(content)) {
    content = content.replace(levelPattern2, "require('../../services/level').levelService");
    changed = true;
  }

  const levelPattern3 = /require\(['"]\.\.\/utils\/levelStore['"]\)/g;
  if (levelPattern3.test(content)) {
    content = content.replace(levelPattern3, "require('../services/level').levelService");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated levelStore paths in ${filePath}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
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

walk(srcDir);
walk(eventsDir);
walk(prefixDir);
processFile(path.join(__dirname, 'src', 'index.js'));
console.log('Level service references updated!');
