import { EnhancedWorkflowOrchestrator } from '../services/enhanced-workflow-orchestrator.js';

/**
 * Enhanced manual trigger handler using dual-strategy compilation error detection
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleEnhancedManualTrigger(context) {
  const { log } = context;
  const { repository, issue, comment } = context.payload;

  log.info(`🔍 Enhanced manual trigger handler called`);
  log.info(`📝 Comment body: "${comment.body}"`);
  log.info(`🏷️ Event type: ${context.name}`);
  log.info(`📁 Repository: ${repository.full_name}`);
  log.info(`📋 Issue number: ${issue.number}`);

  // Prevent bot from responding to its own comments to avoid infinite loops
  if (comment && comment.user && comment.user.type === 'Bot') {
    log.info(`🤖 Ignoring bot comment to prevent infinite loop`);
    return;
  }

  // Check if comment contains /dependafix command
  if (!comment.body.includes('/dependafix')) {
    log.info(`❌ Comment does not contain /dependafix command, ignoring`);
    return;
  }

  // Prevent bot from responding to its own reports to avoid infinite loops
  if (comment.body.includes('Enhanced Dependafix Workflow Report') || 
      comment.body.includes('Enhanced Dependafix Analysis Report') ||
      comment.body.length > 1000) { // Bot reports are typically very long
    log.info(`🤖 Ignoring bot report comment to prevent infinite loop`);
    return;
  }

  log.info(`✅ /dependafix command detected!`);
  log.info(`🔍 Enhanced manual trigger received for ${repository.full_name}`);

  try {
    log.info(`🚀 Starting enhanced workflow execution...`);
    
    // Check if this is a pull request issue
    let pullRequest = null;
    if (issue.pull_request) {
      log.info(`📋 This is a pull request issue, fetching PR details...`);
      try {
        const prResponse = await context.octokit.rest.pulls.get({
          owner: repository.owner.login,
          repo: repository.name,
          pull_number: issue.number
        });
        pullRequest = prResponse.data;
        log.info(`✅ Pull request details fetched: ${pullRequest.title}`);
      } catch (prError) {
        log.error(`❌ Failed to fetch pull request details: ${prError.message}`);
      }
    } else {
      log.info(`📋 This is a regular issue, not a pull request`);
    }
    
    // Execute the enhanced workflow with dual-strategy approach
    const enhancedOrchestrator = new EnhancedWorkflowOrchestrator(context);
    log.info(`📦 EnhancedWorkflowOrchestrator created successfully`);
    
    const workflowResult = await enhancedOrchestrator.executeManualWorkflow({
      pullRequest: pullRequest
    });
    log.info(`✅ Enhanced workflow execution completed with success: ${workflowResult.success}`);
    log.info(`🔧 Build strategy used: ${workflowResult.buildStrategy}`);

    // Generate and post the enhanced report
    log.info(`📝 Generating enhanced workflow report...`);
    const report = generateEnhancedWorkflowReport(workflowResult);
    log.info(`📄 Enhanced report generated, length: ${report.length} characters`);
    
    log.info(`💬 Posting enhanced workflow report to GitHub issue...`);
    await context.octokit.rest.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issue.number,
      body: report
    });

    log.info(`📊 Enhanced workflow report generated for ${repository.full_name}`);

  } catch (error) {
    log.error(`❌ Error in enhanced manual trigger workflow: ${error.message}`);
    log.error(`❌ Error stack: ${error.stack}`);
    
    // Post error message
    try {
      await context.octokit.rest.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        body: `❌ **Enhanced Dependafix Workflow Error**\n\nAn error occurred while processing your request: ${error.message}\n\nPlease try again or contact support if the issue persists.`
      });
      log.info(`✅ Error message posted to GitHub issue`);
    } catch (commentError) {
      log.error(`❌ Failed to post error comment: ${commentError.message}`);
    }
  }
}

/**
 * Generate enhanced comprehensive workflow report
 * @param {Object} workflowResult - Enhanced workflow execution result
 * @returns {string} - Formatted enhanced report
 */
function generateEnhancedWorkflowReport(workflowResult) {
  const { repository, triggerType, workflowSteps, contextPayload, errors, buildStrategy } = workflowResult;

  let report = `## 🔍 Enhanced Dependafix Workflow Report\n\n`;
  report += `**Repository:** \`${repository}\`\n`;
  report += `**Trigger Type:** ${triggerType}\n`;
  report += `**Build Strategy:** ${buildStrategy === 'ci_cd' ? 'CI/CD Output Analysis' : buildStrategy === 'automated_build' ? 'Automated Build Execution' : 'Unknown'}\n`;
  report += `**Status:** ${workflowResult.success ? '✅ Success' : '❌ Failed'}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  // Enhanced workflow steps summary
  report += `### 📋 Enhanced Workflow Steps\n\n`;
  for (const step of workflowSteps) {
    const statusIcon = step.status === 'completed' ? '✅' : 
                      step.status === 'failed' ? '❌' : 
                      step.status === 'skipped' ? '⏭️' : '🔄';
    
    report += `${statusIcon} **${step.step}** (${step.status})\n`;
    if (step.message) {
      report += `   ${step.message}\n`;
    }
    if (step.error) {
      report += `   Error: ${step.error}\n`;
    }
    report += `\n`;
  }

  // Enhanced compilation errors section
  if (contextPayload && contextPayload.compilationErrors) {
    const compilationErrors = contextPayload.compilationErrors;
    report += `### ❌ Compilation Errors (Enhanced Detection)\n\n`;
    report += `**Total Errors:** ${compilationErrors.length}\n`;
    report += `**Detection Method:** ${buildStrategy === 'ci_cd' ? 'CI/CD Log Analysis' : 'Automated Build Execution'}\n\n`;

    if (compilationErrors.length > 0) {
      // Group errors by type
      const errorGroups = {};
      compilationErrors.forEach(error => {
        if (!errorGroups[error.type]) {
          errorGroups[error.type] = [];
        }
        errorGroups[error.type].push(error);
      });
      
      report += `**Error Breakdown:**\n`;
      Object.entries(errorGroups).forEach(([type, errors]) => {
        report += `\n**${type}** (${errors.length} errors):\n`;
        errors.slice(0, 5).forEach((error, index) => {
          report += `${index + 1}. ${error.message}\n`;
          if (error.file && error.file !== 'unknown') {
            report += `   File: \`${error.file}${error.line ? `:${error.line}` : ''}\`\n`;
          }
          if (error.groupId && error.artifactId) {
            report += `   Dependency: \`${error.groupId}:${error.artifactId}:${error.version}\`\n`;
          }
          if (error.confidence) {
            report += `   Confidence: ${error.confidence}%\n`;
          }
        });
        if (errors.length > 5) {
          report += `   ... and ${errors.length - 5} more ${type} errors\n`;
        }
        report += `\n`;
      });
      
      // Show total count
      report += `**Total Errors by Type:**\n`;
      Object.entries(errorGroups).forEach(([type, errors]) => {
        report += `- ${type}: ${errors.length} errors\n`;
      });
      report += `\n`;
    } else {
      report += `✅ No compilation errors detected\n\n`;
    }
  }

  // Enhanced pom.xml changes section
  if (contextPayload && contextPayload.pomChanges && contextPayload.pomChanges.hasChanges) {
    const pomChanges = contextPayload.pomChanges;
    report += `### 📦 pom.xml Changes (Enhanced Analysis)\n\n`;
    report += `**Total Changes:** ${pomChanges.changes.length}\n`;
    report += `**Dependency Changes:** ${pomChanges.dependencyChanges.length}\n`;
    report += `**Build Changes:** ${pomChanges.buildChanges.length}\n`;
    report += `**Summary:** ${pomChanges.summary}\n\n`;

    if (pomChanges.dependencyChanges.length > 0) {
      report += `**Dependency Changes:**\n`;
      pomChanges.dependencyChanges.slice(0, 5).forEach((change, index) => {
        report += `${index + 1}. **${change.type}**: ${change.groupId}:${change.artifactId}\n`;
        if (change.oldVersion && change.newVersion) {
          report += `   Version: ${change.oldVersion} → ${change.newVersion}\n`;
        }
        report += `\n`;
      });
    }
  }

  // Enhanced dependency analysis section
  if (contextPayload && contextPayload.dependencyAnalysis) {
    const dependencyAnalysis = contextPayload.dependencyAnalysis;
    if (dependencyAnalysis.breakingChanges && dependencyAnalysis.breakingChanges.length > 0) {
      report += `### 🚨 Breaking Changes Detected\n\n`;
      dependencyAnalysis.breakingChanges.slice(0, 5).forEach((breakingChange, index) => {
        report += `${index + 1}. **${breakingChange.artifactId}**: ${breakingChange.description}\n`;
        if (breakingChange.suggestedFix) {
          report += `   Suggested Fix: ${breakingChange.suggestedFix}\n`;
        }
        report += `\n`;
      });
    }
  }

  // Enhanced analysis results
  if (contextPayload) {
    const { affectedFiles = [] } = contextPayload;
    report += `### 📊 Enhanced Analysis Results\n\n`;
    report += `**Total Issues:** ${contextPayload.compilationErrors?.length || 0}\n`;
    report += `**Affected Files:** ${affectedFiles.length}\n`;
    report += `**Build Strategy:** ${buildStrategy === 'ci_cd' ? 'Fast CI/CD analysis' : 'Comprehensive automated build'}\n`;
    report += `**Analysis Quality:** ${buildStrategy === 'ci_cd' ? 'High (real CI/CD output)' : 'High (real build execution)'}\n\n`;
  }

  // Errors section
  if (errors && errors.length > 0) {
    report += `### ❌ Workflow Errors\n\n`;
    errors.forEach((error, index) => {
      report += `${index + 1}. **${error.category || 'Unknown'}**: ${error.message}\n`;
      if (error.recoverable !== undefined) {
        report += `   Recoverable: ${error.recoverable ? 'Yes' : 'No'}\n`;
      }
      report += `\n`;
    });
  }

  report += `---\n`;
  report += `*This enhanced analysis was performed using the dual-strategy approach by Dependafix 🤖*\n`;
  report += `*Build Strategy: ${buildStrategy === 'ci_cd' ? 'CI/CD Output Analysis' : 'Automated Build Execution'}*`;

  return report;
}
