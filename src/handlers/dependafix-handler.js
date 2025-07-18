import { DependafixService } from '../services/dependafix/dependafix-service.js';

/**
 * Dependafix Handler - Handles GitHub webhook events for dependency fix automation
 * 
 * This handler integrates with the existing Probot system while adding
 * Java dependency fix capabilities using the Bacardi system.
 */

/**
 * Handle pull request events for dependency fixes
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleDependafixPullRequest(context) {
  const { log } = context;
  const { action, pull_request: pr, repository } = context.payload;
  
  log.info(`🔄 Processing Dependafix PR event: ${action} for ${repository.full_name}#${pr.number}`);
  
  try {
    // Initialize Dependafix service
    const dependafixService = new DependafixService(context);
    
    // Process the pull request
    const result = await dependafixService.processWebhookEvent('pull_request', context.payload);
    
    if (result.success) {
      if (result.skipped) {
        log.info(`✅ PR processing skipped: ${result.reason}`);
      } else if (result.buildSuccessful) {
        log.info(`✅ Build successful - no fixes needed`);
      } else if (result.fixPullRequest) {
        log.info(`🎉 Created fix PR #${result.fixPullRequest.number}`);
        
        // Add comment to original PR
        await addFixPullRequestComment(context, pr, result.fixPullRequest);
      }
    } else {
      log.error(`❌ PR processing failed: ${result.error}`);
      
      // Add error comment to PR
      await addErrorComment(context, pr, result.error);
    }
    
  } catch (error) {
    log.error(`❌ Error in Dependafix PR handler: ${error.message}`, error);
    
    // Add error comment to PR
    await addErrorComment(context, pr, error.message);
  }
}

/**
 * Handle push events for dependency fixes
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleDependafixPush(context) {
  const { log } = context;
  const { repository, commits } = context.payload;
  
  log.info(`🔄 Processing Dependafix push event for ${repository.full_name}`);
  
  try {
    // Initialize Dependafix service
    const dependafixService = new DependafixService(context);
    
    // Process the push
    const result = await dependafixService.processWebhookEvent('push', context.payload);
    
    if (result.success) {
      if (result.skipped) {
        log.info(`✅ Push processing skipped: ${result.reason}`);
      } else if (result.buildSuccessful) {
        log.info(`✅ Build successful - no fixes needed`);
      } else if (result.fixPullRequest) {
        log.info(`🎉 Created fix PR #${result.fixPullRequest.number}`);
        
        // Create issue to track the fix
        await createFixTrackingIssue(context, result);
      }
    } else {
      log.error(`❌ Push processing failed: ${result.error}`);
    }
    
  } catch (error) {
    log.error(`❌ Error in Dependafix push handler: ${error.message}`, error);
  }
}

/**
 * Add comment to PR about created fix
 * @param {import('probot').Context} context - The Probot context
 * @param {Object} originalPr - Original pull request
 * @param {Object} fixPr - Fix pull request
 */
async function addFixPullRequestComment(context, originalPr, fixPr) {
  try {
    const comment = `## 🤖 Dependafix: Automated Fix Created

I've detected potential breaking changes in this dependency update and created an automated fix.

### Fix Details
- **Fix PR**: #${fixPr.number}
- **Issues Fixed**: ${fixPr.issuesFixed || 'Multiple'}
- **Applied Fixes**: ${fixPr.appliedFixes || 'Multiple'}

### Next Steps
1. Review the fix PR: #${fixPr.number}
2. Test the fixes in your environment
3. Merge the fix PR if everything looks good
4. Then you can safely merge this dependency update

### How it works
Dependafix automatically:
1. 🔍 Detects dependency-related build failures
2. 🧠 Uses AI to analyze errors and generate fixes
3. ✅ Validates fixes by rebuilding the project
4. 🚀 Creates a pull request with the fixes

*This is an automated message from Dependafix 🤖*`;

    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: originalPr.number,
      body: comment
    });
  } catch (error) {
    context.log.error(`❌ Failed to add fix PR comment: ${error.message}`);
  }
}

/**
 * Add error comment to PR
 * @param {import('probot').Context} context - The Probot context
 * @param {Object} pr - Pull request
 * @param {string} errorMessage - Error message
 */
async function addErrorComment(context, pr, errorMessage) {
  try {
    const comment = `## 🤖 Dependafix: Processing Error

I encountered an error while trying to process this dependency update:

\`\`\`
${errorMessage}
\`\`\`

This might be due to:
- Unsupported build tool or project structure
- Network issues or timeouts
- Complex dependency conflicts requiring manual intervention

Please review the dependency changes manually or contact support if this error persists.

*This is an automated message from Dependafix 🤖*`;

    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: pr.number,
      body: comment
    });
  } catch (error) {
    context.log.error(`❌ Failed to add error comment: ${error.message}`);
  }
}

/**
 * Create tracking issue for fix
 * @param {import('probot').Context} context - The Probot context
 * @param {Object} result - Processing result
 */
async function createFixTrackingIssue(context, result) {
  try {
    const title = `🤖 Dependafix: Automated fixes applied`;
    const body = `## Automated Dependency Fixes Applied

Dependafix has automatically created fixes for dependency-related build failures.

### Fix Details
- **Processing ID**: \`${result.processingId}\`
- **Fix PR**: #${result.fixPullRequest.number}
- **Issues Fixed**: ${result.issuesFixed}
- **Applied Fixes**: ${result.appliedFixes}

### Review Required
Please review the fix PR and test the changes before merging.

### Fix PR
${result.fixPullRequest.html_url}

*This issue was created automatically by Dependafix 🤖*`;

    await context.octokit.rest.issues.create({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      title,
      body,
      labels: ['dependafix', 'automated-fix', 'dependency']
    });
  } catch (error) {
    context.log.error(`❌ Failed to create tracking issue: ${error.message}`);
  }
}

/**
 * Check if repository supports Dependafix
 * @param {import('probot').Context} context - The Probot context
 * @returns {Promise<boolean>} - True if supported
 */
export async function isRepositorySupported(context) {
  try {
    const { repository } = context.payload;
    
    // Check for Java project indicators
    const javaFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
    
    for (const file of javaFiles) {
      try {
        await context.octokit.rest.repos.getContent({
          owner: repository.owner.login,
          repo: repository.name,
          path: file
        });
        return true; // Found Java build file
      } catch (error) {
        // File not found, continue checking
      }
    }
    
    return false; // No Java build files found
  } catch (error) {
    context.log.error(`❌ Error checking repository support: ${error.message}`);
    return false;
  }
} 