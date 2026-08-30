const logger = require('../../utils/logger');
const AppError = require('../../utils/errors/AppError');

class Command {
  constructor(name, description, options = {}) {
    this.name = name;
    this.description = description;
    this.options = options;
  }

  async canExecute(interaction) {
    return true;
  }

  async execute(interaction) {
    throw new Error('Execute method must be implemented by subclasses');
  }

  async executeWithErrorHandling(interaction) {
    try {
      const allowed = await this.canExecute(interaction);
      if (!allowed) {
        return interaction.reply({ content: 'No tienes permiso para ejecutar este comando.', ephemeral: true });
      }
      await this.execute(interaction);
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn(`AppError in command ${this.name}: ${error.message}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: `⚠️ ${error.message}`, ephemeral: true });
        } else {
          await interaction.followUp({ content: `⚠️ ${error.message}`, ephemeral: true });
        }
      } else {
        logger.error(`Unhandled error in command ${this.name}`, { error: error.message, stack: error.stack });
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocurrió un error inesperado al ejecutar el comando.', ephemeral: true });
        } else {
          await interaction.followUp({ content: '❌ Ocurrió un error inesperado al ejecutar el comando.', ephemeral: true });
        }
      }
    }
  }
}

module.exports = Command;
