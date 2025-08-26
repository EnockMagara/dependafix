import { Probot } from 'probot';
import { handlePullRequestEvent } from './handlers/pull-request-handler.js';
import { handleManualTrigger } from './handlers/manual-trigger-handler.js';
import { setupLogging } from './utils/logger.js';

/**
 * Main Probot application entry point
 * @param {Probot} app - The Probot instance
 */
export default function probotApp(app) {
  // Setup logging
  setupLogging(app);

  // Debug: Log all incoming events
  app.onAny(async (context) => {
    const { name, payload } = context;
    app.log.info(`🔔 Received webhook event: ${name}`);
    
    if (payload.repository) {
      app.log.info(`📁 Repository: ${payload.repository.full_name}`);
    }
    
    if (payload.installation) {
      app.log.info(`🔧 Installation ID: ${payload.installation.id}`);
    }
    
    // Special logging for issue_comment events
    if (name === 'issue_comment') {
      app.log.info(`💬 Issue comment event detected!`);
      if (payload.comment) {
        app.log.info(`📝 Comment body: "${payload.comment.body}"`);
        app.log.info(`🔍 Contains /dependafix: ${payload.comment.body.includes('/dependafix')}`);
      }
      if (payload.issue) {
        app.log.info(`📋 Issue number: ${payload.issue.number}`);
      }
    }
  });

  // Register event handlers
  // Pull request events - primary focus for pom.xml change detection
  app.on('pull_request.opened', handlePullRequestEvent);
  app.on('pull_request.synchronize', handlePullRequestEvent);
  app.on('pull_request.reopened', handlePullRequestEvent);
  
  // Manual trigger for MVP - this is the primary interaction method
  app.on('issue_comment.created', handleManualTrigger);

  // Log when the app is loaded
  app.log.info('Dependafix MVP is loaded and ready!');
  app.log.info('Available events: pull_request.*, issue_comment.created');

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

