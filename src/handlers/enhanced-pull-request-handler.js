import { EnhancedWorkflowOrchestrator } from '../services/enhanced-workflow-orchestrator.js';

/**
 * Enhanced pull request handler using dual-strategy compilation error detection
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleEnhancedPullRequestEvent(context) {
  const { log } = context;
  const { repository, pull_request } = context.payload;
  
  log.info(`🚀 Processing enhanced pull request #${pull_request.number} for ${repository.full_name}`);
  
  try {
    // Use the enhanced workflow orchestrator with dual-strategy approach
    const enhancedOrchestrator = new EnhancedWorkflowOrchestrator(context);
    
    // Execute the enhanced workflow with pull request context
    const workflowResult = await enhancedOrchestrator.executePullRequestWorkflow(pull_request);
    
    if (workflowResult.success) {
      log.info(`✅ Enhanced pull request workflow completed successfully for ${repository.full_name}`);
      log.info(`🔧 Build strategy used: ${workflowResult.buildStrategy}`);
      
      // Log workflow summary
      if (workflowResult.contextPayload) {
        const { compilationErrors, affectedFiles } = workflowResult.contextPayload;
        log.info(`📊 Enhanced workflow summary: ${compilationErrors?.length || 0} compilation errors, ${affectedFiles?.length || 0} affected files`);
        
        // Post analysis comment to the pull request
        await postEnhancedAnalysisComment(context, workflowResult);
      }
    } else {
      log.error(`❌ Enhanced pull request workflow failed for ${repository.full_name}`);
      log.error(`Errors: ${workflowResult.errors.map(e => e.message).join(', ')}`);
    }
    
  } catch (error) {
    log.error(`💥 Enhanced pull request handler failed: ${error.message}`);
    log.error(error.stack);
  }
}

/**
 * Post enhanced analysis comment to pull request
 * @param {import('probot').Context} context - The Probot context
 * @param {Object} workflowResult - The workflow result
 */
async function postEnhancedAnalysisComment(context, workflowResult) {
  const { log } = context;
  const { repository, pull_request } = context.payload;
  const { contextPayload, buildStrategy, workflowSteps } = workflowResult;
  
  try {
    const commentBody = generateEnhancedAnalysisComment(contextPayload, buildStrategy, workflowSteps);
    
    await context.octokit.rest.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pull_request.number,
      body: commentBody
    });
    
    log.info(`✅ Enhanced analysis comment posted to PR #${pull_request.number}`);
    
  } catch (error) {
    log.error(`❌ Failed to post enhanced analysis comment: ${error.message}`);
  }
}

/**
 * Generate enhanced analysis comment
 * @param {Object} contextPayload - The context payload
 * @param {string} buildStrategy - The build strategy used
 * @param {Array} workflowSteps - The workflow steps
 * @returns {string} - The comment body
 */
function generateEnhancedAnalysisComment(contextPayload, buildStrategy, workflowSteps) {
  const { compilationErrors = [], affectedFiles = [], pomChanges } = contextPayload;
  
  let comment = `## 🔍 Enhanced Dependafix Analysis Report

**Build Strategy:** ${buildStrategy === 'ci_cd' ? 'CI/CD Output Analysis' : 'Automated Build Execution'}
**Analysis Status:** ✅ Completed

### 📋 Workflow Steps

`;

  // Add workflow steps
  workflowSteps.forEach((step, index) => {
    const status = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏳';
    comment += `${index + 1}. ${status} **${step.step}**: ${step.message}\n`;
  });

  comment += `\n### 📦 pom.xml Changes`;

  if (pomChanges && pomChanges.hasChanges) {
    comment += `
- **Total Changes:** ${pomChanges.changes.length}
- **Dependency Changes:** ${pomChanges.dependencyChanges.length}
- **Build Changes:** ${pomChanges.buildChanges.length}
- **Summary:** ${pomChanges.summary}
`;
  } else {
    comment += `\n- No pom.xml changes detected\n`;
  }

  comment += `\n### ❌ Compilation Errors

- **Total Errors:** ${compilationErrors.length}
- **Error Types:** ${[...new Set(compilationErrors.map(e => e.type))].join(', ')}

`;

  // Add detailed error breakdown
  if (compilationErrors.length > 0) {
    // Group errors by type
    const errorGroups = {};
    compilationErrors.forEach(error => {
      if (!errorGroups[error.type]) {
        errorGroups[error.type] = [];
      }
      errorGroups[error.type].push(error);
    });
    
    comment += `**Error Breakdown:**\n`;
    Object.entries(errorGroups).forEach(([type, errors]) => {
      comment += `\n**${type}** (${errors.length} errors):\n`;
      errors.slice(0, 3).forEach((error, index) => {
        comment += `${index + 1}. ${error.message}\n`;
        if (error.file && error.file !== 'unknown') {
          comment += `   File: \`${error.file}${error.line ? `:${error.line}` : ''}\`\n`;
        }
        if (error.groupId && error.artifactId) {
          comment += `   Dependency: \`${error.groupId}:${error.artifactId}:${error.version}\`\n`;
        }
      });
      if (errors.length > 3) {
        comment += `   ... and ${errors.length - 3} more ${type} errors\n`;
      }
    });
    
    // Show total count
    comment += `\n**Total Errors by Type:**\n`;
    Object.entries(errorGroups).forEach(([type, errors]) => {
      comment += `- ${type}: ${errors.length} errors\n`;
    });
  } else {
    comment += `✅ No compilation errors detected\n`;
  }

  comment += `\n### 📊 Analysis Results

- **Total Issues:** ${compilationErrors.length}
- **Affected Files:** ${affectedFiles.length}
- **Build Strategy:** ${buildStrategy === 'ci_cd' ? 'Fast CI/CD analysis' : 'Comprehensive automated build'}

---
*This analysis was performed using the enhanced dual-strategy approach by Dependafix 🤖*`;

  return comment;
}
