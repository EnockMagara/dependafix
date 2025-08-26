import { WorkflowOrchestrator } from '../services/workflow-orchestrator.js';

/**
 * Handles push events from GitHub (MVP - complete workflow up to context payload)
 * @param {import('probot').Context} context - The Probot context
 */
export async function handlePushEvent(context) {
  const { log } = context;
  const { repository, commits } = context.payload;
  
  log.info(`🚀 Processing push event for ${repository.full_name}`);
  
  try {
    // Execute the complete workflow
    const workflowOrchestrator = new WorkflowOrchestrator(context);
    const workflowResult = await workflowOrchestrator.executeWorkflow('push');
    
    if (workflowResult.success) {
      log.info(`✅ Push workflow completed successfully for ${repository.full_name}`);
      
      // Log workflow summary
      if (workflowResult.contextPayload) {
        const { summary } = workflowResult.contextPayload;
        log.info(`📊 Workflow Summary: ${summary.totalFailures} failures, ${summary.totalAffectedFiles} affected files`);
        
        // Log high-confidence dependency issues
        const dependencyIssues = workflowResult.contextPayload.failures.filter(f => 
          f.type === 'dependency_breaking_change' || 
          f.type === 'security_vulnerability' || 
          f.type === 'dependency_outdated' ||
          f.type === 'dependency_missing'
        );
        
        if (dependencyIssues.length > 0) {
          log.info(`🚨 Found ${dependencyIssues.length} high-confidence dependency-related issues`);
        }
      }
    } else {
      log.warn(`⚠️ Push workflow completed with issues for ${repository.full_name}`);
      if (workflowResult.errors.length > 0) {
        log.error(`❌ Workflow errors: ${workflowResult.errors.join(', ')}`);
      }
    }
    
  } catch (error) {
    log.error(`❌ Error in push workflow: ${error.message}`);
  }
} 