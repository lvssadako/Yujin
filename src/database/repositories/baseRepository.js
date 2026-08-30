/**
 * Base Repository for data access abstraction
 */

class BaseRepository {
  /**
   * @param {import('../adapters/baseAdapter')} adapter
   * @param {string} collectionName
   */
  constructor(adapter, collectionName) {
    if (!adapter) throw new Error('Database adapter is required');
    this.adapter = adapter;
    this.collection = collectionName;
  }

  async find(key) {
    return this.adapter.get(this.collection, key);
  }

  async save(key, value) {
    return this.adapter.set(this.collection, key, value);
  }

  async delete(key) {
    return this.adapter.delete(this.collection, key);
  }

  async all() {
    return this.adapter.getAll(this.collection);
  }
}

module.exports = BaseRepository;
