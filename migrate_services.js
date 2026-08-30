const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'commands');
const eventsDir = path.join(__dirname, 'events');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace utils/economy with services/economy
  if (content.includes("require('../../../utils/economy')") || content.includes("require('../../utils/economy')")) {
    content = content.replace(/require\(['"]\.\.\/\.\.\/\.\.\/utils\/economy['"]\)/g, "require('../../../services/economy').economyService");
    content = content.replace(/require\(['"]\.\.\/\.\.\/utils\/economy['"]\)/g, "require('../../services/economy').economyService");
    changed = true;
  }

  // Same for events (../utils/economy)
  if (content.includes("require('../utils/economy')")) {
    content = content.replace(/require\(['"]\.\.\/utils\/economy['"]\)/g, "require('../src/services/economy').economyService");
    changed = true;
  }
  
  if (content.includes("require('./utils/economy')")) {
    content = content.replace(/require\(['"]\.\/utils\/economy['"]\)/g, "require('./src/services/economy').economyService");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated services paths in ${filePath}`);
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
processFile(path.join(__dirname, 'index.js'));
console.log('Service references updated!');
