import { WorkflowOrchestrator } from '../services/workflow-orchestrator.js';

/**
 * Handle manual trigger via /dependafix command in issue comments
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleManualTrigger(context) {
  const { log } = context;
  const { repository, issue, comment } = context.payload;

  log.info(`🔍 Manual trigger handler called`);
  log.info(`📝 Comment body: "${comment.body}"`);
  log.info(`🏷️ Event type: ${context.name}`);
  log.info(`📁 Repository: ${repository.full_name}`);
  log.info(`📋 Issue number: ${issue.number}`);

  // Check if comment contains /dependafix command
  if (!comment.body.includes('/dependafix')) {
    log.info(`❌ Comment does not contain /dependafix command, ignoring`);
    return;
  }

  log.info(`✅ /dependafix command detected!`);
  log.info(`🔍 Manual trigger received for ${repository.full_name}`);

  try {
    log.info(`🚀 Starting workflow execution...`);
    
    // Execute the complete workflow
    const workflowOrchestrator = new WorkflowOrchestrator(context);
    log.info(`📦 WorkflowOrchestrator created successfully`);
    
    const workflowResult = await workflowOrchestrator.executeWorkflow('manual');
    log.info(`✅ Workflow execution completed with success: ${workflowResult.success}`);

    // Generate and post the report
    log.info(`📝 Generating workflow report...`);
    const report = generateWorkflowReport(workflowResult);
    log.info(`📄 Report generated, length: ${report.length} characters`);
    
    log.info(`💬 Posting workflow report to GitHub issue...`);
    await context.octokit.rest.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issue.number,
      body: report
    });

    log.info(`📊 Workflow report generated for ${repository.full_name}`);

  } catch (error) {
    log.error(`❌ Error in manual trigger workflow: ${error.message}`);
    log.error(`❌ Error stack: ${error.stack}`);
    
    // Post error message
    try {
      await context.octokit.rest.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        body: `❌ **Dependafix Workflow Error**\n\nAn error occurred while processing your request: ${error.message}\n\nPlease try again or contact support if the issue persists.`
      });
      log.info(`✅ Error message posted to GitHub issue`);
    } catch (commentError) {
      log.error(`❌ Failed to post error comment: ${commentError.message}`);
    }
  }
}

/**
 * Generate comprehensive workflow report
 * @param {Object} workflowResult - Workflow execution result
 * @returns {string} - Formatted report
 */
function generateWorkflowReport(workflowResult) {
  const { repository, triggerType, workflowSteps, contextPayload, errors } = workflowResult;

  let report = `## 🔍 Dependafix Workflow Report\n\n`;
  report += `**Repository:** \`${repository}\`\n`;
  report += `**Trigger Type:** ${triggerType}\n`;
  report += `**Status:** ${workflowResult.success ? '✅ Success' : '❌ Failed'}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  // Workflow steps summary
  report += `### 📋 Workflow Steps\n\n`;
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

  // Errors summary
  if (errors.length > 0) {
    report += `### ❌ Errors\n\n`;
    for (const error of errors) {
      report += `- ${error}\n`;
    }
    report += `\n`;
  }

  // Context payload summary
  if (contextPayload) {
    report += `### 📊 Analysis Summary\n\n`;
    report += `**Total Failures:** ${contextPayload.summary.totalFailures}\n`;
    report += `**Affected Files:** ${contextPayload.summary.totalAffectedFiles}\n`;
    report += `**Build Status:** ${contextPayload.buildInfo.success ? '✅ Success' : '❌ Failed'}\n`;
    report += `**Build Tool:** ${contextPayload.buildInfo.tool}\n`;
    report += `**Java Version:** ${contextPayload.buildInfo.javaVersion || 'Unknown'}\n\n`;

    // Failure types breakdown
    if (Object.keys(contextPayload.summary.failureTypes).length > 0) {
      report += `**Failure Types:**\n`;
      for (const [type, count] of Object.entries(contextPayload.summary.failureTypes)) {
        report += `- ${type}: ${count}\n`;
      }
      report += `\n`;
    }

    // Severity distribution
    if (Object.keys(contextPayload.summary.severityDistribution).length > 0) {
      report += `**Severity Distribution:**\n`;
      for (const [severity, count] of Object.entries(contextPayload.summary.severityDistribution)) {
        if (count > 0) {
          report += `- ${severity}: ${count}\n`;
        }
      }
      report += `\n`;
    }

    // High-confidence dependency-related errors
    const dependencyErrors = contextPayload.failures.filter(f => 
      f.type === 'dependency_breaking_change' || 
      f.type === 'security_vulnerability' || 
      f.type === 'dependency_outdated' ||
      f.type === 'dependency_missing'
    );

    if (dependencyErrors.length > 0) {
      report += `### 🚨 **High-Confidence Dependency-Related Issues** (${dependencyErrors.length})\n\n`;
      
      dependencyErrors.forEach((error, index) => {
        report += `${index + 1}. **${error.type}** (${error.confidence}% confidence): ${error.message}\n`;
        report += `   - File: \`${error.file}\`\n`;
        report += `   - Line: ${error.line}\n`;
        report += `   - Severity: ${error.severity}\n`;
        
        if (error.dependencyInfo) {
          report += `   - Dependency: ${error.dependencyInfo.groupId}:${error.dependencyInfo.artifactId}:${error.dependencyInfo.version}\n`;
        }
        
        if (error.securityInfo) {
          report += `   - CVE: ${error.securityInfo.cveId}\n`;
        }
        
        report += `\n`;
      });
    }

    // Other compilation errors
    const otherErrors = contextPayload.failures.filter(f => 
      !['dependency_breaking_change', 'security_vulnerability', 'dependency_outdated', 'dependency_missing'].includes(f.type)
    );

    if (otherErrors.length > 0) {
      report += `### ⚠️ **Other Compilation Errors** (${otherErrors.length})\n\n`;
      
      // Group errors by type
      const errorGroups = {};
      otherErrors.forEach(error => {
        if (!errorGroups[error.type]) {
          errorGroups[error.type] = [];
        }
        errorGroups[error.type].push(error);
      });
      
      Object.entries(errorGroups).forEach(([type, errors]) => {
        report += `**${type}** (${errors.length}):\n`;
        errors.forEach((error, index) => {
          report += `${index + 1}. ${error.message}\n`;
          report += `   - File: \`${error.file}\`\n`;
          report += `   - Line: ${error.line}\n`;
          if (error.confidence) {
            report += `   - Confidence: ${error.confidence}%\n`;
          }
          report += `\n`;
        });
      });
    }

    // API diffs summary
    if (contextPayload.apiDiffs && contextPayload.apiDiffs.length > 0) {
      report += `### 🔄 **API Changes Detected** (${contextPayload.apiDiffs.length})\n\n`;
      
      contextPayload.apiDiffs.slice(0, 5).forEach((diff, index) => {
        report += `${index + 1}. **${diff.filePath}** (${diff.apiChanges.length} changes)\n`;
        report += `   - Commit: ${diff.commitSha.substring(0, 8)}\n`;
        report += `   - Message: ${diff.commitMessage.split('\n')[0]}\n`;
        report += `   - Changes: +${diff.additions} -${diff.deletions}\n\n`;
      });
      
      if (contextPayload.apiDiffs.length > 5) {
        report += `*... and ${contextPayload.apiDiffs.length - 5} more API changes*\n\n`;
      }
    }

    // Dependency information summary
    if (contextPayload.dependencyInfo && contextPayload.dependencyInfo.dependencies.length > 0) {
      report += `### 📦 **Dependencies Analyzed** (${contextPayload.dependencyInfo.dependencies.length})\n\n`;
      
      // Show vulnerable dependencies
      const vulnerableDeps = contextPayload.dependencyInfo.securityVulnerabilities;
      if (vulnerableDeps.length > 0) {
        report += `**Security Vulnerabilities Found:**\n`;
        vulnerableDeps.forEach((vuln, index) => {
          report += `${index + 1}. **${vuln.dependency.coordinates}** - ${vuln.cveId}\n`;
          report += `   - Severity: ${vuln.severity}\n`;
          report += `   - Description: ${vuln.description}\n\n`;
        });
      }
    }
  }

  report += `---\n\n`;
  report += `**Note:** This is the MVP version. Dependafix has extracted dependency information and failure details.\n`;
  report += `The next phase will send this data to Byam API for fix generation.\n\n`;
  report += `**Workflow ID:** \`${contextPayload?.metadata?.workflowId || 'unknown'}\``;

  return report;
}
