import { WorkflowOrchestrator } from '../services/workflow-orchestrator.js';
import { PomXmlChangeDetector } from '../services/pom-xml-change-detector.js';
import { CompilationErrorDetector } from '../services/compilation-error-detector.js';
import { RepositoryChecker } from '../services/repository-checker.js';
import { JavaProjectDetector } from '../services/java-project-detector.js';

/**
 * Handles pull request events with focus on pom.xml changes and compilation errors
 * @param {import('probot').Context} context - The Probot context
 */
export async function handlePullRequestEvent(context) {
  const { log } = context;
  const { repository, pull_request } = context.payload;
  
  log.info(`🚀 Processing pull request #${pull_request.number} for ${repository.full_name}`);
  
  try {
    // Step 1: Check if this is a Java project
    const javaDetector = new JavaProjectDetector(context);
    const isJavaProject = await javaDetector.isJavaProject();
    
    if (!isJavaProject) {
      log.info(`⏭️ Skipping non-Java project: ${repository.full_name}`);
      return;
    }

    const buildTool = await javaDetector.getBuildTool();
    log.info(`✅ Java project detected (${buildTool}) for ${repository.full_name}`);

    // Step 2: Detect pom.xml changes in the pull request
    const pomChangeDetector = new PomXmlChangeDetector(context);
    const pomChanges = await pomChangeDetector.detectPomXmlChanges(pull_request);
    
    if (!pomChanges.hasChanges) {
      log.info(`⏭️ No pom.xml changes detected in PR #${pull_request.number}`);
      return;
    }

    log.info(`📦 pom.xml changes detected in PR #${pull_request.number}: ${pomChanges.summary}`);

    // Step 3: Check for compilation errors after pom.xml changes
    const compilationDetector = new CompilationErrorDetector(context);
    const compilationErrors = await compilationDetector.detectCompilationErrors();
    
    if (compilationErrors.length === 0) {
      log.info(`✅ No compilation errors detected after pom.xml changes in PR #${pull_request.number}`);
      return;
    }

    log.info(`❌ Compilation errors detected after pom.xml changes: ${compilationErrors.length} errors`);

    // Step 4: Checkout the repository for detailed analysis
    const repoChecker = new RepositoryChecker(context);
    const checkoutResult = await repoChecker.checkoutRepository(pull_request.head.sha);
    
    if (!checkoutResult.success) {
      log.error(`❌ Failed to checkout repository: ${checkoutResult.error}`);
      return;
    }

    log.info(`📁 Repository checked out successfully to: ${checkoutResult.path}`);

    // Step 5: Execute comprehensive workflow analysis
    const workflowOrchestrator = new WorkflowOrchestrator(context);
    const workflowResult = await workflowOrchestrator.executeWorkflow('pull_request', {
      pomChanges,
      compilationErrors,
      checkoutPath: checkoutResult.path
    });
    
    if (workflowResult.success) {
      log.info(`✅ Pull request workflow completed successfully for ${repository.full_name}`);
      
      // Log workflow summary
      if (workflowResult.contextPayload) {
        const { summary } = workflowResult.contextPayload;
        log.info(`📊 Workflow Summary: ${summary.totalFailures} failures, ${summary.totalAffectedFiles} affected files`);
        
        // Log pom.xml specific issues
        const pomRelatedIssues = workflowResult.contextPayload.failures.filter(f => 
          f.type === 'dependency_breaking_change' || 
          f.type === 'dependency_resolution_error' ||
          f.type === 'pom_xml_issue'
        );
        
        if (pomRelatedIssues.length > 0) {
          log.info(`🚨 Found ${pomRelatedIssues.length} pom.xml related issues`);
        }
      }
    } else {
      log.warn(`⚠️ Pull request workflow completed with issues for ${repository.full_name}`);
      if (workflowResult.errors.length > 0) {
        log.error(`❌ Workflow errors: ${workflowResult.errors.join(', ')}`);
      }
    }
    
  } catch (error) {
    log.error(`❌ Error in pull request workflow: ${error.message}`);
    log.error(`Stack trace: ${error.stack}`);
  }
}
