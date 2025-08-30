/**
 * Enhanced Workflow Orchestrator for Dependafix
 * Implements the improved dual-strategy approach for compilation error detection
 */
import { JavaProjectDetector } from './java-project-detector.js';
import { PomXmlChangeDetector } from './pom-xml-change-detector.js';
import { EnhancedBuildExecutor } from './enhanced-build-executor.js';
import { DependencyBreakingChangeAPI } from './dependency-breaking-change-api.js';
import { ContextExtractor } from './context-extractor.js';
import { ErrorHandler } from './error-handler.js';

export class EnhancedWorkflowOrchestrator {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    
    // Initialize services
    this.javaDetector = new JavaProjectDetector(context);
    this.pomDetector = new PomXmlChangeDetector(context);
    this.buildExecutor = new EnhancedBuildExecutor(context);
    this.breakingChangeAPI = new DependencyBreakingChangeAPI();
    this.contextExtractor = new ContextExtractor(context);
    this.errorHandler = new ErrorHandler(context);
  }

  /**
   * Main enhanced workflow orchestration
   * @param {string} triggerType - 'push', 'pull_request', or 'manual'
   * @param {Object} options - Additional options for the workflow
   * @returns {Object} - Workflow result with context payload
   */
  async executeWorkflow(triggerType = 'manual', options = {}) {
    const { repository } = this.context.payload;
    this.log.info(`🚀 Starting Enhanced Dependafix workflow for ${repository.full_name} (${triggerType})`);
    
    const workflowResult = {
      success: false,
      triggerType,
      repository: repository.full_name,
      workflowSteps: [],
      contextPayload: null,
      errors: [],
      buildStrategy: 'unknown'
    };

    try {
      // Step 1: Check if this is a Java project
      workflowResult.workflowSteps.push({
        step: 'project_detection',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const isJavaProject = await this.javaDetector.isJavaProject();
      if (!isJavaProject) {
        workflowResult.workflowSteps[0].status = 'failed';
        workflowResult.workflowSteps[0].message = 'Not a Java project';
        workflowResult.errors.push('Repository is not a Java project');
        return workflowResult;
      }

      const buildTool = await this.javaDetector.getBuildTool();
      workflowResult.workflowSteps[0].status = 'completed';
      workflowResult.workflowSteps[0].message = `Java project detected (${buildTool})`;

      // Step 2: Detect version changes (always check for PR triggers)
      let versionChanges = null;
      if (triggerType === 'pull_request' && options.pullRequest) {
        workflowResult.workflowSteps.push({
          step: 'version_change_detection',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        versionChanges = await this.pomDetector.detectVersionChanges(options.pullRequest);
        
        if (!versionChanges.hasVersionChanges) {
          workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'skipped';
          workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
            'No version changes detected';
          
          // Early exit for no version changes
          workflowResult.success = true;
          workflowResult.skipped = true;
          workflowResult.reason = 'No version changes';
          return workflowResult;
        }
        
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
          `${versionChanges.versionChanges.length} version changes detected`;
      } else if (triggerType === 'manual' && options.pullRequest) {
        // For manual triggers, also check for version changes if we have a PR context
        workflowResult.workflowSteps.push({
          step: 'version_change_detection',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        versionChanges = await this.pomDetector.detectVersionChanges(options.pullRequest);
        
        if (!versionChanges.hasVersionChanges) {
          workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'skipped';
          workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
            'No version changes detected';
          
          // Early exit for no version changes
          workflowResult.success = true;
          workflowResult.skipped = true;
          workflowResult.reason = 'No version changes';
          return workflowResult;
        }
        
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
          `${versionChanges.versionChanges.length} version changes detected`;
      }

      // Step 3: Execute enhanced build with dual strategy
      workflowResult.workflowSteps.push({
        step: 'compilation_error_detection',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const buildOptions = {
        commitSha: options.commitSha,
        skipTests: options.skipTests || false,
        versionChanges: versionChanges
      };

      const buildResult = await this.buildExecutor.executeBuild(buildTool, buildOptions);
      
      workflowResult.buildStrategy = buildResult.strategy;
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
        `${buildResult.failures.length} compilation errors detected using ${buildResult.strategy} strategy`;

      // Step 4: Extract context for AI analysis
      workflowResult.workflowSteps.push({
        step: 'context_extraction',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const contextPayload = await this.contextExtractor.extractContextPayload({
        versionChanges: versionChanges,
        compilationErrors: buildResult.failures,
        buildResult: buildResult,
        buildTool: buildTool,
        triggerType: triggerType
      });

      workflowResult.contextPayload = contextPayload;
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 
        'Context extracted successfully';

      workflowResult.success = true;

      this.log.info(`✅ Enhanced workflow completed successfully using ${buildResult.strategy} strategy`);
      
    } catch (error) {
      this.log.error(`❌ Enhanced workflow failed: ${error.message}`);
      
      // Handle error with error handler
      const errorResult = await this.errorHandler.handleError(error, 'enhanced_workflow', {
        triggerType: triggerType,
        repository: repository.full_name
      });

      workflowResult.errors.push({
        message: error.message,
        category: errorResult.category,
        recoverable: errorResult.recoverable
      });

      // Mark current step as failed
      if (workflowResult.workflowSteps.length > 0) {
        const currentStep = workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1];
        if (currentStep.status === 'running') {
          currentStep.status = 'failed';
          currentStep.message = error.message;
        }
      }
    }

    return workflowResult;
  }

  /**
   * Analyze dependency changes and detect breaking changes
   * @param {Object} pomChanges - pom.xml changes detected
   * @param {Array} compilationErrors - Compilation errors from build
   * @returns {Object} - Dependency analysis result
   */
  async analyzeDependencyChanges(pomChanges, compilationErrors) {
    const analysis = {
      breakingChanges: [],
      dependencyErrors: [],
      recommendations: []
    };

    try {
      // Extract dependency changes
      const dependencyChanges = pomChanges.dependencyChanges || [];
      
      for (const change of dependencyChanges) {
        if (change.type === 'version_change' || change.type === 'dependency_added') {
          // Check for breaking changes using the API
          const breakingChangeResult = await this.breakingChangeAPI.detectBreakingChanges(
            change.groupId,
            change.artifactId,
            change.oldVersion,
            change.newVersion
          );
          
          if (breakingChangeResult.breakingChanges) {
            analysis.breakingChanges.push(...breakingChangeResult.breakingChanges);
          }
        }
      }

      // Correlate compilation errors with dependency changes
      const dependencyErrors = compilationErrors.filter(error => 
        error.type === 'dependency_error' || 
        error.message.includes('cannot find symbol') ||
        error.message.includes('package') ||
        error.message.includes('import')
      );

      analysis.dependencyErrors = dependencyErrors;

      // Generate recommendations based on analysis
      analysis.recommendations = this.generateRecommendations(
        dependencyChanges,
        analysis.breakingChanges,
        dependencyErrors
      );

    } catch (error) {
      this.log.error(`Error analyzing dependency changes: ${error.message}`);
    }

    return analysis;
  }

  /**
   * Generate recommendations based on analysis
   * @param {Array} dependencyChanges - Dependency changes
   * @param {Array} breakingChanges - Breaking changes detected
   * @param {Array} dependencyErrors - Dependency-related errors
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(dependencyChanges, breakingChanges, dependencyErrors) {
    const recommendations = [];

    // Add recommendations based on breaking changes
    for (const breakingChange of breakingChanges) {
      recommendations.push({
        type: 'breaking_change_fix',
        priority: 'high',
        message: `Breaking change detected in ${breakingChange.artifactId}: ${breakingChange.description}`,
        suggestedFix: breakingChange.suggestedFix || 'Review breaking changes and update code accordingly'
      });
    }

    // Add recommendations based on dependency errors
    for (const error of dependencyErrors) {
      recommendations.push({
        type: 'dependency_error_fix',
        priority: 'high',
        message: `Dependency error: ${error.message}`,
        suggestedFix: 'Check dependency versions and compatibility'
      });
    }

    return recommendations;
  }

  /**
   * Execute workflow for pull request events
   * @param {Object} pullRequest - Pull request object
   * @returns {Object} - Workflow result
   */
  async executePullRequestWorkflow(pullRequest) {
    return this.executeWorkflow('pull_request', {
      pullRequest: pullRequest,
      commitSha: pullRequest.head.sha
    });
  }



  /**
   * Execute workflow for manual triggers
   * @param {Object} options - Manual trigger options
   * @returns {Object} - Workflow result
   */
  async executeManualWorkflow(options = {}) {
    return this.executeWorkflow('manual', options);
  }
}
