const fs = require('fs');
const path = require('path');

const srcCommandsDir = path.join(__dirname, 'src', 'commands');
const oldCommandsDir = path.join(__dirname, 'commands');

function walkAndMigrate(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'base') walkAndMigrate(fullPath);
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('module.exports = require(')) {
        // Find the original file
        const originalName = file;
        const originalPath = path.join(oldCommandsDir, originalName);
        if (fs.existsSync(originalPath)) {
          let originalContent = fs.readFileSync(originalPath, 'utf8');
          
          // Fix requires:
          // In old dir, utils was ../utils or ./utils
          // In new dir (src/commands/category/), utils is ../../../utils
          originalContent = originalContent.replace(/require\(['"]\.\/utils\/(.*?)['"]\)/g, "require('../../../utils/$1')");
          originalContent = originalContent.replace(/require\(['"]\.\.\/utils\/(.*?)['"]\)/g, "require('../../../utils/$1')");
          
          // Same for tools
          originalContent = originalContent.replace(/require\(['"]\.\/tools\/(.*?)['"]\)/g, "require('../../../tools/$1')");
          originalContent = originalContent.replace(/require\(['"]\.\.\/tools\/(.*?)['"]\)/g, "require('../../../tools/$1')");
          
          // data
          originalContent = originalContent.replace(/require\(['"]\.\/data\/(.*?)['"]\)/g, "require('../../../data/$1')");
          originalContent = originalContent.replace(/require\(['"]\.\.\/data\/(.*?)['"]\)/g, "require('../../../data/$1')");
          
          // JSON requires
          originalContent = originalContent.replace(/require\(['"]\.\/config\.json['"]\)/g, "require('../../../config.json')");
          originalContent = originalContent.replace(/require\(['"]\.\.\/config\.json['"]\)/g, "require('../../../config.json')");
          
          fs.writeFileSync(fullPath, originalContent, 'utf8');
          console.log(`Migrated ${file} to ${fullPath}`);
          
          // Optional: Rename original to .js.bak to avoid conflicts
          fs.renameSync(originalPath, originalPath + '.bak');
        }
      }
    }
  }
}

walkAndMigrate(srcCommandsDir);
console.log('Migration complete!');
