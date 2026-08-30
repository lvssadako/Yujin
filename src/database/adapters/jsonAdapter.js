const path = require('path');
const BaseDatabaseAdapter = require('./baseAdapter');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');

class JsonDatabaseAdapter extends BaseDatabaseAdapter {
  /**
   * @param {Object} options
   * @param {string} [options.dataDir] - Path to data storage directory
   */
  constructor(options = {}) {
    super('json');
    this.dataDir = options.dataDir || path.join(__dirname, '..', '..', '..', 'data');
    this.cache = new Map();
  }

  getFilePath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  async connect() {
    return true;
  }

  async disconnect() {
    this.cache.clear();
    return true;
  }

  async getAll(collection) {
    const filePath = this.getFilePath(collection);
    return readJsonSafe(filePath, {});
  }

  async get(collection, key) {
    const data = await this.getAll(collection);
    return data[key] !== undefined ? data[key] : null;
  }

  async set(collection, key, value) {
    const filePath = this.getFilePath(collection);
    const data = readJsonSafe(filePath, {});
    data[key] = value;
    writeJsonAtomic(filePath, data);
    return value;
  }

  async delete(collection, key) {
    const filePath = this.getFilePath(collection);
    const data = readJsonSafe(filePath, {});
    if (data[key] !== undefined) {
      delete data[key];
      writeJsonAtomic(filePath, data);
      return true;
    }
    return false;
  }

  async updateAll(collection, data) {
    const filePath = this.getFilePath(collection);
    writeJsonAtomic(filePath, data);
    return data;
  }
}

module.exports = JsonDatabaseAdapter;
