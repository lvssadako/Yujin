const fs = require('node:fs');
const path = require('node:path');
const { ConfigSchema } = require('./schema');
const logger = require('../logger');

function validateConfig(config) {
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path: issue.path.join('.') || 'root',
      message: issue.message
    }));

    const message = issues.map(issue => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`Invalid config: ${message}`);
  }

  return result.data;
}

function loadAndValidateConfig(filePath) {
  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const defaultConfig = {
      bumpReminder: { enabled: false },
      roleXpBonuses: {}
    };
    try {
      fs.writeFileSync(fullPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      logger.warn(`Config file not found at ${fullPath}. Generated default config template.`);
      return validateConfig(defaultConfig);
    } catch {
      return validateConfig(defaultConfig);
    }
  }

  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = validateConfig(parsed);
    logger.info('Config validated', { filePath: fullPath });
    return validated;
  } catch (error) {
    logger.error('Config validation failed', {
      filePath: fullPath,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = { validateConfig, loadAndValidateConfig };
