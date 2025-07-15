/**
 * Setup logging for the Probot application
 * @param {import('probot').Probot} app - The Probot instance
 */
export function setupLogging(app) {
  // Log all webhook events for debugging
  app.onAny(async (context) => {
    const { name, payload } = context;
    app.log.info(`🔔 Received webhook event: ${name}`);
    
    if (payload.repository) {
      app.log.info(`📁 Repository: ${payload.repository.full_name}`);
    }
    
    if (payload.installation) {
      app.log.info(`🔧 Installation ID: ${payload.installation.id}`);
    }
    
    // Log additional context for push events
    if (name === 'push' && payload.commits) {
      app.log.info(`📝 Commits: ${payload.commits.length}`);
      payload.commits.forEach((commit, index) => {
        app.log.info(`  ${index + 1}. ${commit.message.split('\n')[0]}`);
      });
    }
  });

  // Log errors
  app.onError(async (error) => {
    app.log.error(`❌ Application error: ${error.message}`, error);
  });
}

/**
 * Create a structured log message
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {string} - Formatted log message
 */
export function createLogMessage(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...metadata
  };
  
  return JSON.stringify(logEntry, null, 2);
} 