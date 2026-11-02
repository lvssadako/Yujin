const fs = require('node:fs');
const path = require('node:path');

const ROOT_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'config.json', '.env.example', '.gitignore', 'LICENSE', 'SECURITY.md', 'AGENTS.md', 'README.md', 'LEEME-EXPORTACION.md', 'clear-commands.js', 'migrate.js', 'migrate-levels.js', 'migrate_services_levels.js', 'fix-logger.js'];
const ROOT_DIRS = ['src', 'assets', 'sources', 'config', 'docs', 'scripts', 'fast-deep-equal'];
function isReleasePath(relative) {
  const normalized = relative.split(path.sep).join('/');
  const parts = normalized.split('/');
  return !parts.some(part => ['__tests__', 'node_modules', 'data', 'logs', '.git', '.github', 'dist'].includes(part))
    && !parts.some(part => /^\.env(?:\.|$)/.test(part) && part !== '.env.example')
    && !/\.(?:test|spec)\.[cm]?js$/.test(normalized)
    && !/\.(?:pem|key|log|zip|tar|gz)$/.test(normalized)
    && !/^src\/commands\/debug\/test[^/]*\.js$/.test(normalized);
}
function buildRelease(root, destination) {
  const sourceRoot = path.resolve(root);
  const output = path.resolve(destination);
  const relativeOutput = path.relative(sourceRoot, output);
  if (!relativeOutput.startsWith('dist' + path.sep)) throw new Error('La versión final debe guardarse dentro de dist/.');
  if (fs.existsSync(output)) throw new Error('El destino ya existe. Guarda esa versión o utiliza otra carpeta dentro de dist/.');
  fs.mkdirSync(output, { recursive: true });
  function copy(relative) {
    if (!isReleasePath(relative)) return;
    const source = path.join(sourceRoot, relative);
    if (!fs.existsSync(source)) return;
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) return;
    const target = path.join(output, relative);
    if (stat.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const name of fs.readdirSync(source)) copy(path.join(relative, name));
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
  for (const relative of [...ROOT_FILES, ...ROOT_DIRS]) copy(relative);
  const packagePath = path.join(output, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  for (const name of Object.keys(manifest.scripts || {})) if (name === 'test' || name.startsWith('test:')) delete manifest.scripts[name];
  fs.writeFileSync(packagePath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'VERSION-FINAL.md'), '# Versión final de Yujin\n\nEsta carpeta contiene el bot sin pruebas automatizadas ni comandos de diagnóstico de prueba.\nLas pruebas se conservan en el proyecto de desarrollo y QA.\n\nInstala con `pnpm install --frozen-lockfile` y ejecuta `pnpm start`. Configura las variables de entorno del bot y conserva los datos de tu servidor al actualizar.\n');
  return output;
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, 'dist', 'production');
  console.log('Versión final preparada en ' + buildRelease(root, destination));
}
module.exports = { buildRelease, isReleasePath };
