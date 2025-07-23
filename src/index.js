import { Probot } from 'probot';
import { BreakingChangeDetector } from './services/breaking-change-detector.js';
import { BranchCreator } from './services/branch-creator.js';
import { CICDIntegration } from './services/ci-cd-integration.js';
import { setupLogging } from './utils/logger.js';

/**
 * Java Breaking Change Detector - Main Probot application
 * 
 * This application detects breaking changes in Java dependency updates and
 * automatically creates new branches when breaking changes are detected.
 * Features comprehensive CI/CD integration with GitHub Actions.
 * 
 * Design Patterns Used:
 * - Observer Pattern: Webhook event handling
 * - Strategy Pattern: Different detection strategies for Maven vs Gradle
 * - Factory Pattern: Creates appropriate detectors and branch creators
 * - Command Pattern: Encapsulates breaking change detection as commands
 */
export default function probotApp(app) {
  // Setup logging
  setupLogging(app);

  // Initialize services
  const breakingChangeDetector = new BreakingChangeDetector(app);
  const branchCreator = new BranchCreator(app);
  const cicdIntegration = new CICDIntegration(app);

  // Handle push events (primary focus for Java dependency updates)
  app.on('push', async (context) => {
    const { repository, commits } = context.payload;
    
    app.log.info(`🚀 Processing push event for ${repository.full_name}`);
    
    try {
      // Check if this is a Java dependency update
      const isDependencyUpdate = await breakingChangeDetector.isDependencyUpdate(commits);
      
      if (isDependencyUpdate) {
        app.log.info(`☕ Java dependency update detected in ${repository.full_name}`);
        
        // Detect breaking changes with comprehensive build validation
        const breakingChanges = await breakingChangeDetector.detectBreakingChanges(context);
        
        if (breakingChanges.hasBreakingChanges) {
          app.log.info(`⚠️ Breaking changes detected in Java dependency update`);
          
          // Create new branch with fixes
          const branchResult = await branchCreator.createFixBranch(context, breakingChanges);
          
          if (branchResult.success) {
            app.log.info(`✅ Created fix branch: ${branchResult.branchName}`);
            
            // Create issue to track the breaking changes
            await createBreakingChangeIssue(context, breakingChanges, branchResult);
            
            // Integrate with CI/CD system
            const cicdResult = await cicdIntegration.integrateWithCICD(context, breakingChanges);
            if (cicdResult.success) {
              app.log.info(`🔗 CI/CD integration completed: ${cicdResult.platform}`);
            }
          } else {
            app.log.error(`❌ Failed to create fix branch: ${branchResult.error}`);
          }
        } else {
          app.log.info(`✅ No breaking changes detected in Java dependency update`);
          
          // Still integrate with CI/CD for future monitoring
          const cicdResult = await cicdIntegration.integrateWithCICD(context, breakingChanges);
          if (cicdResult.success) {
            app.log.info(`🔗 CI/CD integration completed: ${cicdResult.platform}`);
          }
        }
      } else {
        app.log.info(`📝 Push event processed - no Java dependency changes detected`);
      }
      
    } catch (error) {
      app.log.error(`❌ Error processing push event: ${error.message}`, error);
    }
  });

  // Handle pull request events (secondary focus)
  app.on('pull_request', async (context) => {
    const { action, pull_request: pr, repository } = context.payload;
    
    // Only process opened and synchronized PRs
    if (action === 'opened' || action === 'synchronize') {
      app.log.info(`🔍 Processing PR #${pr.number} for Java breaking changes`);
      
      try {
        // Detect breaking changes
        const breakingChanges = await breakingChangeDetector.detectBreakingChanges(context);
        
        if (breakingChanges.hasBreakingChanges) {
          app.log.info(`⚠️ Breaking changes detected in PR #${pr.number}`);
          
          // Create new branch with fixes
          const branchResult = await branchCreator.createFixBranch(context, breakingChanges);
          
          if (branchResult.success) {
            app.log.info(`✅ Created fix branch: ${branchResult.branchName}`);
            
            // Add comment to PR
            await addBreakingChangeComment(context, pr, breakingChanges, branchResult);
            
            // Integrate with CI/CD system
            const cicdResult = await cicdIntegration.integrateWithCICD(context, breakingChanges);
            if (cicdResult.success) {
              app.log.info(`🔗 CI/CD integration completed: ${cicdResult.platform}`);
            }
          } else {
            app.log.error(`❌ Failed to create fix branch: ${branchResult.error}`);
          }
        } else {
          app.log.info(`✅ No breaking changes detected in PR #${pr.number}`);
        }
        
      } catch (error) {
        app.log.error(`❌ Error processing PR #${pr.number}: ${error.message}`, error);
      }
    }
  });

  // Handle CI/CD workflow events
  app.on('workflow_run', async (context) => {
    const { workflow_run, repository } = context.payload;
    
    app.log.info(`🔗 Processing workflow run for ${repository.full_name}`);
    
    try {
      // Handle workflow events through CI/CD integration
      const workflowResult = await cicdIntegration.handleWorkflowEvent(context);
      
      if (workflowResult.success && workflowResult.action === 'issue_created') {
        app.log.info(`✅ CI/CD workflow issue created for breaking changes`);
      } else {
        app.log.info(`📝 CI/CD workflow processed - no action required`);
      }
      
    } catch (error) {
      app.log.error(`❌ Error processing workflow event: ${error.message}`, error);
    }
  });

  // Handle manual breaking change check triggers
  app.on('issue_comment.created', async (context) => {
    const { comment, issue } = context.payload;
    
    // Check if comment contains trigger command
    if (comment.body.includes('/check-breaking-changes')) {
      app.log.info(`🔍 Manual Java breaking change check triggered on issue #${issue.number}`);
      
      try {
        const breakingChanges = await breakingChangeDetector.detectBreakingChanges(context);
        
        // Add comment with results
        await addBreakingChangeCheckComment(context, issue.number, breakingChanges);
        
        // If breaking changes found, offer CI/CD integration
        if (breakingChanges.hasBreakingChanges) {
          const cicdResult = await cicdIntegration.integrateWithCICD(context, breakingChanges);
          if (cicdResult.success) {
            app.log.info(`🔗 CI/CD integration offered: ${cicdResult.platform}`);
          }
        }
        
      } catch (error) {
        app.log.error(`❌ Error in manual breaking change check: ${error.message}`);
        
        await addBreakingChangeCheckComment(context, issue.number, {
          hasBreakingChanges: false,
          error: error.message
        });
      }
    }
    
    // Handle CI/CD integration command
    if (comment.body.includes('/setup-cicd')) {
      app.log.info(`🔗 Manual CI/CD setup triggered on issue #${issue.number}`);
      
      try {
        // Create a mock breaking changes object for CI/CD setup
        const mockBreakingChanges = {
          hasBreakingChanges: false,
          changes: [],
          buildTool: 'maven',
          projectType: 'java'
        };
        
        const cicdResult = await cicdIntegration.integrateWithCICD(context, mockBreakingChanges);
        
        if (cicdResult.success) {
          await addCICDSetupComment(context, issue.number, cicdResult);
        } else {
          await addCICDSetupComment(context, issue.number, { success: false, error: cicdResult.error });
        }
        
      } catch (error) {
        app.log.error(`❌ Error in CI/CD setup: ${error.message}`);
        await addCICDSetupComment(context, issue.number, { success: false, error: error.message });
      }
    }
  });

  // Log when the app is loaded
  app.log.info('🚀 Java Breaking Change Detector is loaded and ready!');
  app.log.info('☕ Supports: Maven and Gradle Java projects');
  app.log.info('🔧 Build validation: Enabled with comprehensive analysis');
  app.log.info('🔗 CI/CD Integration: GitHub Actions, Jenkins, GitLab CI');

  // Handle app installation
  app.on('installation.created', async (context) => {
    const { installation } = context.payload;
    app.log.info(`✅ App installed on account: ${installation.account.login}`);
  });

  // Handle app uninstallation
  app.on('installation.deleted', async (context) => {
    const { installation } = context.payload;
    app.log.info(`❌ App uninstalled from account: ${installation.account.login}`);
  });

  // Handle errors gracefully
  app.onError(async (error, context) => {
    app.log.error(`💥 Unhandled error: ${error.message}`, error);
    
    if (context && context.payload && context.payload.repository) {
      app.log.error(`📍 Error occurred in repository: ${context.payload.repository.full_name}`);
    }
  });

  // Add health check endpoint
  app.route('/health').get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'java-breaking-change-detector',
      version: '1.0.0',
      features: {
        buildValidation: true,
        mavenSupport: true,
        gradleSupport: true,
        automaticBranchCreation: true,
        cicdIntegration: true,
        githubActions: true,
        jenkins: true,
        gitlabCI: true
      }
    });
  });
}

/**
 * Add comment to PR about detected breaking changes
 */
async function addBreakingChangeComment(context, pr, breakingChanges, branchResult) {
  try {
    const comment = `## ⚠️ Java Breaking Changes Detected

I've detected breaking changes in this Java dependency update and created a fix branch.

### Build Validation Results
- **Build Tool**: ${breakingChanges.buildTool}
- **Build Status**: ${breakingChanges.buildValidation.success ? '✅ Success' : '❌ Failed'}
- **Build Failures**: ${breakingChanges.buildValidation.buildFailures.length}

### Breaking Changes Found
${breakingChanges.changes.map(change => `- **${change.type}**: ${change.description} (${change.severity})`).join('\n')}

### Fix Branch Created
- **Branch**: \`${branchResult.branchName}\`
- **Files Modified**: ${branchResult.filesModified.length}
- **Issues Fixed**: ${breakingChanges.changes.length}

### CI/CD Integration
I've also set up CI/CD workflows to automatically detect breaking changes in future updates.

### Next Steps
1. Review the fix branch: \`${branchResult.branchName}\`
2. Test the changes in your environment
3. Run the build validation: \`${breakingChanges.buildTool === 'maven' ? 'mvn clean compile test' : './gradlew clean build'}\`
4. Create a pull request from the fix branch if needed
5. The CI/CD pipeline will now monitor for breaking changes automatically

*This is an automated message from Java Breaking Change Detector 🤖*`;

    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: pr.number,
      body: comment
    });
  } catch (error) {
    context.log.error(`❌ Failed to add breaking change comment: ${error.message}`);
  }
}

/**
 * Create issue to track breaking changes
 */
async function createBreakingChangeIssue(context, breakingChanges, branchResult) {
  try {
    const title = `⚠️ Java Breaking Changes Detected - Fix Branch Created`;
    const body = `## Java Breaking Changes Detected

Breaking changes were detected in a recent Java dependency update.

### Build Validation Results
- **Build Tool**: ${breakingChanges.buildTool}
- **Build Status**: ${breakingChanges.buildValidation.success ? '✅ Success' : '❌ Failed'}
- **Build Failures**: ${breakingChanges.buildValidation.buildFailures.length}

### Breaking Changes Found
${breakingChanges.changes.map(change => `- **${change.type}**: ${change.description} (${change.severity})`).join('\n')}

### Fix Branch Created
- **Branch**: \`${branchResult.branchName}\`
- **Files Modified**: ${branchResult.filesModified.length}
- **Issues Fixed**: ${breakingChanges.changes.length}

### Build Validation Details
${breakingChanges.buildValidation.buildFailures.map(failure => 
  `- **${failure.type}**: ${failure.message} (${failure.severity})`
).join('\n')}

### CI/CD Integration
CI/CD workflows have been set up to automatically detect breaking changes in future updates.

### Review Required
Please review the fix branch and test the changes before merging.

### Recommended Actions
1. Checkout the fix branch: \`git checkout ${branchResult.branchName}\`
2. Run build validation: \`${breakingChanges.buildTool === 'maven' ? 'mvn clean compile test' : './gradlew clean build'}\`
3. Test the application thoroughly
4. Create a pull request if the fixes are satisfactory
5. The CI/CD pipeline will now monitor for breaking changes automatically

*This issue was created automatically by Java Breaking Change Detector 🤖*`;

    await context.octokit.rest.issues.create({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      title,
      body,
      labels: ['breaking-changes', 'java', 'automated-fix', 'dependency', 'build-failure', 'ci-cd-integration']
    });
  } catch (error) {
    context.log.error(`❌ Failed to create breaking change issue: ${error.message}`);
  }
}

/**
 * Add breaking change check results as a comment
 */
async function addBreakingChangeCheckComment(context, issueNumber, breakingChanges) {
  try {
    let comment = `## 🔍 Java Breaking Change Check Results\n\n`;
    
    if (breakingChanges.error) {
      comment += `❌ **Check failed**: ${breakingChanges.error}\n\n`;
      comment += `Please try again later or contact support if the issue persists.`;
    } else if (breakingChanges.hasBreakingChanges) {
      comment += `⚠️ **Java Breaking Changes Detected**: ${breakingChanges.changes.length}\n\n`;
      comment += `### Build Validation Results\n`;
      comment += `- **Build Tool**: ${breakingChanges.buildTool}\n`;
      comment += `- **Build Status**: ${breakingChanges.buildValidation.success ? '✅ Success' : '❌ Failed'}\n`;
      comment += `- **Build Failures**: ${breakingChanges.buildValidation.buildFailures.length}\n\n`;
      
      comment += `### Changes Found\n`;
      breakingChanges.changes.forEach(change => {
        comment += `- **${change.type}**: ${change.description} (${change.severity})\n`;
      });
      
      comment += `\n### Build Failures\n`;
      breakingChanges.buildValidation.buildFailures.forEach(failure => {
        comment += `- **${failure.type}**: ${failure.message} (${failure.severity})\n`;
      });
      
      comment += `\n### Recommendations\n`;
      comment += `- Review the changes carefully\n`;
      comment += `- Test thoroughly before merging\n`;
      comment += `- Run build validation: \`${breakingChanges.buildTool === 'maven' ? 'mvn clean compile test' : './gradlew clean build'}\`\n`;
      comment += `- Consider creating a fix branch\n`;
      comment += `- Use \`/setup-cicd\` to enable automatic CI/CD monitoring\n`;
    } else {
      comment += `✅ **No Java Breaking Changes Detected**\n\n`;
      comment += `The Java dependency update appears to be safe to merge.\n\n`;
      comment += `### Build Validation Results\n`;
      comment += `- **Build Tool**: ${breakingChanges.buildTool}\n`;
      comment += `- **Build Status**: ✅ Success\n`;
      comment += `- **Build Failures**: 0\n`;
    }
    
    comment += `\n\n---\n*This check was performed by Java Breaking Change Detector 🤖*`;
    
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: issueNumber,
      body: comment
    });
    
  } catch (error) {
    context.log.error(`❌ Error adding breaking change check comment: ${error.message}`);
  }
}

/**
 * Add CI/CD setup results as a comment
 */
async function addCICDSetupComment(context, issueNumber, cicdResult) {
  try {
    let comment = `## 🔗 CI/CD Integration Setup\n\n`;
    
    if (cicdResult.success) {
      comment += `✅ **CI/CD Integration Successful**\n\n`;
      comment += `### Platform Detected\n`;
      comment += `- **Platform**: ${cicdResult.platform}\n\n`;
      
      comment += `### Workflows Created\n`;
      if (cicdResult.workflowResult?.success) {
        comment += `- **Breaking Change Detection**: ${cicdResult.workflowResult.workflowFile}\n`;
      }
      if (cicdResult.detectionResult?.success) {
        comment += `- **Detection Action**: ${cicdResult.detectionResult.actionFile}\n`;
      }
      if (cicdResult.notificationResult?.success) {
        comment += `- **Notifications**: ${cicdResult.notificationResult.notificationFile}\n`;
      }
      
      comment += `\n### What This Enables\n`;
      comment += `- **Automatic Detection**: CI/CD will automatically detect breaking changes\n`;
      comment += `- **Workflow Integration**: Breaking change detection is now part of your CI/CD pipeline\n`;
      comment += `- **Notifications**: Automatic notifications when breaking changes are detected\n`;
      comment += `- **Issue Creation**: Automatic issue creation for CI/CD failures\n`;
      
      comment += `\n### Next Steps\n`;
      comment += `1. Review the created workflows in your repository\n`;
      comment += `2. Customize the workflows if needed\n`;
      comment += `3. The CI/CD pipeline will now monitor for breaking changes automatically\n`;
      comment += `4. Use \`/check-breaking-changes\` anytime to manually check for breaking changes\n`;
    } else {
      comment += `❌ **CI/CD Integration Failed**\n\n`;
      comment += `**Error**: ${cicdResult.error}\n\n`;
      comment += `Please try again later or contact support if the issue persists.`;
    }
    
    comment += `\n\n---\n*This setup was performed by Java Breaking Change Detector 🤖*`;
    
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: issueNumber,
      body: comment
    });
    
  } catch (error) {
    context.log.error(`❌ Error adding CI/CD setup comment: ${error.message}`);
  }
} 