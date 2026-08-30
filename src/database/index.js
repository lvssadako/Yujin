const BaseDatabaseAdapter = require('./adapters/baseAdapter');
const JsonDatabaseAdapter = require('./adapters/jsonAdapter');
const BaseRepository = require('./repositories/baseRepository');
const EconomyRepository = require('./repositories/economyRepository');

// Default database instances
const defaultAdapter = new JsonDatabaseAdapter();
const economyRepository = new EconomyRepository(defaultAdapter);

module.exports = {
  BaseDatabaseAdapter,
  JsonDatabaseAdapter,
  BaseRepository,
  EconomyRepository,
  defaultAdapter,
  economyRepository
};
