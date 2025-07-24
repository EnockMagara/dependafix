import { Probot } from 'probot';
import { handlePushEvent } from './handlers/push-handler.js';
import { setupLogging } from './utils/logger.js';

/**
 * Main Probot application entry point
 * @param {Probot} app - The Probot instance
 */
export default function probotApp(app) {
  // Setup logging
  setupLogging(app);

  // Register event handlers
  app.on('push', handlePushEvent);

  // Log when the app is loaded
  app.log.info('Dependency Bot is loaded and ready!');

  // Handle app installation
  app.on('installation.created', async (context) => {
    const { installation } = context.payload;
    app.log.info(`App installed on account: ${installation.account.login}`);
  });

  // Handle app uninstallation
  app.on('installation.deleted', async (context) => {
    const { installation } = context.payload;
    app.log.info(`App uninstalled from account: ${installation.account.login}`);
  });
} 
