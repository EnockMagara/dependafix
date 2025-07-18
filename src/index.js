import { Probot } from 'probot';
import { handlePushEvent } from './handlers/push-handler.js';
import { handleDependafixPullRequest, handleDependafixPush, isRepositorySupported } from './handlers/dependafix-handler.js';
import { handleDependencyCheck, handleScheduledDependencyCheck, handleManualDependencyCheck } from './handlers/dependency-check-handler.js';
import { setupLogging } from './utils/logger.js';

/**
 * Main Probot application entry point
 * 
 * This application now supports both:
 * 1. Node.js package.json dependency fixes (original functionality)
 * 2. Java dependency fixes using Dependafix + Byam integration
 * 
 * @param {Probot} app - The Probot instance
 */
export default function probotApp(app) {
  // Setup logging
  setupLogging(app);

  // Register event handlers with smart routing
  app.on('push', async (context) => {
    const isJavaProject = await isRepositorySupported(context);
    
    if (isJavaProject) {
      // Route to Dependafix for Java projects
      await handleDependafixPush(context);
    } else {
      // Route to original handler for Node.js projects
      await handlePushEvent(context);
    }
  });

  app.on('pull_request', async (context) => {
    const { action } = context.payload;
    
    // Only process opened and synchronized PRs
    if (action === 'opened' || action === 'synchronize') {
      const isJavaProject = await isRepositorySupported(context);
      
      if (isJavaProject) {
        // Route to Dependafix for Java projects
        await handleDependafixPullRequest(context);
      }
      // Note: Original system doesn't handle PR events, only push events
    }
  });

  // Handle manual dependency check triggers
  app.on('issue_comment.created', async (context) => {
    await handleManualDependencyCheck(context);
  });

  // Handle scheduled dependency checks (can be triggered via webhook)
  app.on('schedule.repository', async (context) => {
    await handleScheduledDependencyCheck(context);
  });

  // Log when the app is loaded
  app.log.info('🚀 Dependency Bot is loaded and ready!');
  app.log.info('📦 Supports: Node.js (package.json) and Java (Maven/Gradle) projects');

  // Handle app installation
  app.on('installation.created', async (context) => {
    const { installation } = context.payload;
    app.log.info(`✅ App installed on account: ${installation.account.login}`);
    
    // Could add welcome message or setup instructions here
  });

  // Handle app uninstallation
  app.on('installation.deleted', async (context) => {
    const { installation } = context.payload;
    app.log.info(`❌ App uninstalled from account: ${installation.account.login}`);
  });

  // Handle repository added to installation
  app.on('installation_repositories.added', async (context) => {
    const { installation, repositories_added } = context.payload;
    
    for (const repo of repositories_added) {
      app.log.info(`📁 Repository added: ${repo.full_name}`);
      
      // Check if it's a supported project type
      try {
        const tempContext = { ...context, payload: { ...context.payload, repository: repo } };
        const isJavaProject = await isRepositorySupported(tempContext);
        
        if (isJavaProject) {
          app.log.info(`☕ Java project detected: ${repo.full_name}`);
        } else {
          app.log.info(`📦 Node.js project assumed: ${repo.full_name}`);
        }
      } catch (error) {
        app.log.warn(`⚠️ Could not determine project type for ${repo.full_name}: ${error.message}`);
      }
    }
  });

  // Handle errors gracefully
  app.onError(async (error, context) => {
    app.log.error(`💥 Unhandled error: ${error.message}`, error);
    
    // Could add error reporting or notification here
    if (context && context.payload && context.payload.repository) {
      app.log.error(`📍 Error occurred in repository: ${context.payload.repository.full_name}`);
    }
  });

  // Add health check endpoint
  app.route('/health').get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        'package-json-analyzer': 'active',
        'dependafix-java': 'active',
        'byam-llm': 'active'
      }
    });
  });

  // Add status endpoint
  app.route('/status').get('/status', (req, res) => {
    res.json({
      name: 'Dependency Bot',
      version: '2.0.0',
      description: 'Automated dependency update fix generation',
      capabilities: [
        'Node.js package.json dependency fixes',
        'Java Maven/Gradle dependency fixes',
        'LLM-powered fix generation',
        'Automated pull request creation'
      ],
      integrations: {
        bacardi: 'active',
        probot: 'active',
        github: 'active'
      }
    });
  });
} 