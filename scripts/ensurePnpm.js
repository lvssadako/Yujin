const userAgent = process.env.npm_config_user_agent || '';
const execPath = (process.env.npm_execpath || '').toLowerCase();

if (!userAgent.startsWith('pnpm/') && !execPath.includes('pnpm')) {
  console.error('Este proyecto requiere pnpm@11.24.0. No uses npm para instalar dependencias.');
  process.exit(1);
}
