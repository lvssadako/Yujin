const AppError = require('./AppError');

class PermissionError extends AppError {
  constructor(message = 'No tienes permiso para ejecutar esta acción') {
    super(message, 403);
  }
}

module.exports = PermissionError;
