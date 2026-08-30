/**
 * Base Database Adapter Interface
 */

class BaseDatabaseAdapter {
  constructor(name = 'base') {
    this.name = name;
  }

  async connect() {
    throw new Error('connect() not implemented');
  }

  async disconnect() {
    throw new Error('disconnect() not implemented');
  }

  async get(collection, key) {
    throw new Error('get() not implemented');
  }

  async set(collection, key, value) {
    throw new Error('set() not implemented');
  }

  async delete(collection, key) {
    throw new Error('delete() not implemented');
  }

  async getAll(collection) {
    throw new Error('getAll() not implemented');
  }
}

module.exports = BaseDatabaseAdapter;
