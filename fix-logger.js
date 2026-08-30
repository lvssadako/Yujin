const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const loggerPattern = /require\(['"]\.\.\/src\/utils\/logger['"]\)/g;
  const normalized = filePath.replace(/\\/g, '/');
  
  if (loggerPattern.test(content)) {
    loggerPattern.lastIndex = 0;
    let replaceStr;
    if (normalized.includes('/src/commands/')) {
      replaceStr = "require('../../utils/logger')";
    } else if (normalized.includes('/src/events/') || normalized.includes('/src/prefixCommands/')) {
      replaceStr = "require('../utils/logger')";
    } else if (normalized.includes('/src/utils/')) {
      replaceStr = "require('./logger')";
    } else {
      replaceStr = "require('./utils/logger')"; // in src root
    }

    content = content.replace(loggerPattern, replaceStr);
    changed = true;
  }

  // Also fix require('../../utils/logger') if it's deeply nested in src/commands/category/cmd.js
  // Wait, src/commands/category/cmd.js should be require('../../../utils/logger')
  const loggerPattern2 = /require\(['"]\.\.\/\.\.\/utils\/logger['"]\)/g;
  if (normalized && normalized.includes('/src/commands/') && normalized.split('/').length > 3) {
    if (loggerPattern2.test(content)) {
      content = content.replace(loggerPattern2, "require('../../../utils/logger')");
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) processFile(p);
  }
}

walk('./src');
