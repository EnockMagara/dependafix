/**
 * Workflow Orchestrator for Dependafix MVP
 * Implements the complete workflow up to generating JSON payload with context
 * (without calling Byam API yet)
 */
import { JavaProjectDetector } from './java-project-detector.js';
import { CompilationErrorDetector } from './compilation-error-detector.js';
import { DependencyBreakingChangeAPI } from './dependency-breaking-change-api.js';
import { BuildExecutor } from './build-executor.js';
import { ContextExtractor } from './context-extractor.js';

export class WorkflowOrchestrator {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    
    // Initialize services
    this.javaDetector = new JavaProjectDetector(context);
    this.errorDetector = new CompilationErrorDetector(context);
    this.breakingChangeAPI = new DependencyBreakingChangeAPI();
    this.buildExecutor = new BuildExecutor(context);
    this.contextExtractor = new ContextExtractor(context);
  }

  /**
   * Main workflow orchestration
   * @param {string} triggerType - 'push', 'pull_request', or 'manual'
   * @param {Object} options - Additional options for the workflow
   * @returns {Object} - Workflow result with context payload
   */
  async executeWorkflow(triggerType = 'manual', options = {}) {
    const { repository } = this.context.payload;
    this.log.info(`🚀 Starting Dependafix workflow for ${repository.full_name} (${triggerType})`);
    
    const workflowResult = {
      success: false,
      triggerType,
      repository: repository.full_name,
      workflowSteps: [],
      contextPayload: null,
      errors: []
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

      // Step 2: Handle different trigger types
      if (triggerType === 'pull_request') {
        // For pull requests, we already have pom.xml changes and compilation errors
        workflowResult.workflowSteps.push({
          step: 'pom_xml_analysis',
          status: 'completed',
          timestamp: new Date().toISOString(),
          message: `pom.xml changes detected: ${options.pomChanges?.summary || 'Unknown'}`
        });

        workflowResult.workflowSteps.push({
          step: 'compilation_error_detection',
          status: 'completed',
          timestamp: new Date().toISOString(),
          message: `${options.compilationErrors?.length || 0} compilation errors detected`
        });

        // Use the provided compilation errors
        const compilationErrors = options.compilationErrors || [];
        const buildResult = {
          success: compilationErrors.length === 0,
          failures: compilationErrors,
          logs: 'Compilation errors detected from pull request analysis',
          buildTime: 0,
          javaVersion: null,
          buildTool
        };

        // Step 3: Analyze pom.xml changes and their impact
        workflowResult.workflowSteps.push({
          step: 'pom_impact_analysis',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        const pomImpact = await this.analyzePomXmlImpact(options.pomChanges, compilationErrors);
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Analyzed ${pomImpact.issues.length} pom.xml related issues`;

      } else {
        // For other trigger types, use the original workflow
        workflowResult.workflowSteps.push({
          step: 'dependency_change_detection',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        const hasDependencyChanges = await this.checkForDependencyChanges();
        if (!hasDependencyChanges) {
          workflowResult.workflowSteps[1].status = 'skipped';
          workflowResult.workflowSteps[1].message = 'No dependency changes detected';
          workflowResult.success = true;
          return workflowResult;
        }

        workflowResult.workflowSteps[1].status = 'completed';
        workflowResult.workflowSteps[1].message = 'Dependency changes detected';

        // Step 3: Execute build and capture logs
        workflowResult.workflowSteps.push({
          step: 'build_execution',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        const buildResult = await this.buildExecutor.executeBuild(buildTool);
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Build ${buildResult.success ? 'succeeded' : 'failed'}`;

        // Step 4: Detect compilation errors and failures
        workflowResult.workflowSteps.push({
          step: 'error_detection',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        const compilationErrors = await this.errorDetector.detectCompilationErrors();
        const buildFailures = buildResult.success ? [] : buildResult.failures;
        
        const allErrors = [...compilationErrors, ...buildFailures];
        
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
        workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Found ${allErrors.length} errors`;
      }

      // Step 3: Execute build and capture logs
      workflowResult.workflowSteps.push({
        step: 'build_execution',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const buildResult = await this.buildExecutor.executeBuild(buildTool);
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Build ${buildResult.success ? 'succeeded' : 'failed'}`;

      // Step 4: Detect compilation errors and failures
      workflowResult.workflowSteps.push({
        step: 'error_detection',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const compilationErrors = await this.errorDetector.detectCompilationErrors();
      const buildFailures = buildResult.success ? [] : buildResult.failures;
      
      const allErrors = [...compilationErrors, ...buildFailures];
      
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Found ${allErrors.length} errors`;

      // Step 5: Extract failure details and identify affected code
      workflowResult.workflowSteps.push({
        step: 'failure_analysis',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const failureDetails = await this.extractFailureDetails(allErrors);
      const affectedCode = await this.identifyAffectedCode(allErrors);
      
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Analyzed ${failureDetails.length} failures, ${affectedCode.length} affected files`;

      // Step 6: Generate API diffs and dependency information
      workflowResult.workflowSteps.push({
        step: 'context_extraction',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const apiDiffs = await this.contextExtractor.extractAPIDiffs();
      const dependencyInfo = await this.contextExtractor.extractDependencyInfo();
      
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = `Extracted API diffs and dependency info`;

      // Step 7: Generate JSON payload with context
      workflowResult.workflowSteps.push({
        step: 'payload_generation',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const contextPayload = await this.generateContextPayload({
        failureDetails,
        affectedCode,
        apiDiffs,
        dependencyInfo,
        buildResult,
        compilationErrors
      });

      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].status = 'completed';
      workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1].message = 'Context payload generated';

      // Set final result
      workflowResult.success = true;
      workflowResult.contextPayload = contextPayload;
      
      this.log.info(`✅ Workflow completed successfully for ${repository.full_name}`);
      this.log.info(`📊 Generated context payload with ${contextPayload.failures.length} failures, ${contextPayload.affectedCode.length} affected files`);

    } catch (error) {
      this.log.error(`❌ Workflow failed: ${error.message}`);
      workflowResult.errors.push(error.message);
      
      // Mark current step as failed
      if (workflowResult.workflowSteps.length > 0) {
        const currentStep = workflowResult.workflowSteps[workflowResult.workflowSteps.length - 1];
        currentStep.status = 'failed';
        currentStep.error = error.message;
      }
    }

    return workflowResult;
  }

  /**
   * Check for dependency changes in recent commits
   * @returns {boolean} - True if dependency files were modified
   */
  async checkForDependencyChanges() {
    const { repository } = this.context.payload;
    
    try {
      // Get recent commits
      const commits = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });

      // Check if any commit modified dependency files
      const dependencyFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json'];
      
      for (const commit of commits.data) {
        const commitDetails = await this.octokit.rest.repos.getCommit({
          owner: repository.owner.login,
          repo: repository.name,
          ref: commit.sha
        });

        for (const file of commitDetails.data.files) {
          if (dependencyFiles.some(depFile => file.filename.includes(depFile))) {
            this.log.info(`✅ Dependency change detected in commit ${commit.sha}: ${file.filename}`);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.log.error(`Error checking for dependency changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract detailed failure information
   * @param {Array} errors - Array of compilation errors
   * @returns {Array} - Detailed failure information
   */
  async extractFailureDetails(errors) {
    const failureDetails = [];

    for (const error of errors) {
      const detail = {
        id: `failure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: error.type || 'unknown',
        message: error.message || error.rawError || 'Unknown error',
        file: error.file || 'unknown',
        line: error.line || 0,
        confidence: error.confidence || 0,
        severity: error.severity || 'medium',
        timestamp: new Date().toISOString(),
        context: {
          buildTool: await this.javaDetector.getBuildTool(),
          triggerType: this.context.payload.action || 'manual'
        }
      };

      // Add specific details based on error type
      if (error.type === 'dependency_breaking_change') {
        detail.dependencyInfo = {
          groupId: error.groupId,
          artifactId: error.artifactId,
          version: error.version,
          breakingChangeType: error.breakingChangeType
        };
      }

      if (error.type === 'security_vulnerability') {
        detail.securityInfo = {
          cveId: error.cveId,
          severity: error.severity,
          description: error.description
        };
      }

      failureDetails.push(detail);
    }

    return failureDetails;
  }

  /**
   * Identify code affected by the failures
   * @param {Array} errors - Array of compilation errors
   * @returns {Array} - Affected code information
   */
  async identifyAffectedCode(errors) {
    const affectedCode = [];
    const { repository } = this.context.payload;

    try {
      // Group errors by file
      const errorsByFile = {};
      for (const error of errors) {
        if (error.file && error.file !== 'unknown') {
          if (!errorsByFile[error.file]) {
            errorsByFile[error.file] = [];
          }
          errorsByFile[error.file].push(error);
        }
      }

      // Analyze each affected file
      for (const [filePath, fileErrors] of Object.entries(errorsByFile)) {
        try {
          // Get file content
          const fileContent = await this.octokit.rest.repos.getContent({
            owner: repository.owner.login,
            repo: repository.name,
            path: filePath
          });

          if (fileContent.data && fileContent.data.content) {
            const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
            
            const affectedFile = {
              filePath,
              errorCount: fileErrors.length,
              errors: fileErrors,
              content: content,
              lines: content.split('\n'),
              affectedLines: this.extractAffectedLines(fileErrors, content),
              fileType: this.getFileType(filePath),
              size: content.length
            };

            affectedCode.push(affectedFile);
          }
        } catch (fileError) {
          this.log.warn(`Could not read file ${filePath}: ${fileError.message}`);
        }
      }

    } catch (error) {
      this.log.error(`Error identifying affected code: ${error.message}`);
    }

    return affectedCode;
  }

  /**
   * Extract affected lines from file content
   * @param {Array} errors - Errors for a specific file
   * @param {string} content - File content
   * @returns {Array} - Affected line information
   */
  extractAffectedLines(errors, content) {
    const affectedLines = [];
    const lines = content.split('\n');

    for (const error of errors) {
      if (error.line && error.line > 0 && error.line <= lines.length) {
        const lineNumber = error.line - 1; // Convert to 0-based index
        const lineContent = lines[lineNumber];
        
        affectedLines.push({
          lineNumber: error.line,
          content: lineContent,
          errorType: error.type,
          message: error.message,
          confidence: error.confidence
        });
      }
    }

    return affectedLines;
  }

  /**
   * Get file type based on extension
   * @param {string} filePath - File path
   * @returns {string} - File type
   */
  getFileType(filePath) {
    const extension = filePath.split('.').pop().toLowerCase();
    
    switch (extension) {
      case 'java': return 'java_source';
      case 'xml': return 'xml_config';
      case 'gradle': return 'gradle_config';
      case 'properties': return 'properties_config';
      case 'json': return 'json_config';
      default: return 'unknown';
    }
  }

  /**
   * Generate comprehensive context payload
   * @param {Object} contextData - All context data
   * @returns {Object} - Data to be sent to Byam (not JSON payload)
   */
  async generateContextPayload(contextData) {
    const { repository } = this.context.payload;
    const buildTool = await this.javaDetector.getBuildTool();

    // This is the data that will be sent to Byam
    // Byam will generate the actual JSON payload
    const dataForByam = {
      repository: {
        fullName: repository.full_name,
        owner: repository.owner.login,
        name: repository.name,
        url: repository.html_url
      },
      
      buildInfo: {
        tool: buildTool,
        success: contextData.buildResult.success,
        logs: contextData.buildResult.logs,
        buildTime: contextData.buildResult.buildTime,
        javaVersion: contextData.buildResult.javaVersion
      },
      
      failures: contextData.failureDetails,
      affectedCode: contextData.affectedCode,
      apiDiffs: contextData.apiDiffs,
      dependencyInfo: contextData.dependencyInfo,
      
      compilationErrors: contextData.compilationErrors,
      
      summary: {
        totalFailures: contextData.failureDetails.length,
        totalAffectedFiles: contextData.affectedCode.length,
        failureTypes: this.categorizeFailures(contextData.failureDetails),
        severityDistribution: this.analyzeSeverity(contextData.failureDetails),
        confidenceScores: this.analyzeConfidence(contextData.failureDetails)
      },
      
      metadata: {
        timestamp: new Date().toISOString(),
        workflowId: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        triggerType: this.context.payload.action || 'manual'
      }
    };

    return dataForByam;
  }

  /**
   * Categorize failures by type
   * @param {Array} failures - Array of failures
   * @returns {Object} - Failure type counts
   */
  categorizeFailures(failures) {
    const categories = {};
    
    for (const failure of failures) {
      const type = failure.type || 'unknown';
      categories[type] = (categories[type] || 0) + 1;
    }
    
    return categories;
  }

  /**
   * Analyze severity distribution
   * @param {Array} failures - Array of failures
   * @returns {Object} - Severity distribution
   */
  analyzeSeverity(failures) {
    const severity = { high: 0, medium: 0, low: 0, unknown: 0 };
    
    for (const failure of failures) {
      const sev = failure.severity || 'unknown';
      severity[sev] = (severity[sev] || 0) + 1;
    }
    
    return severity;
  }

  /**
   * Analyze confidence scores
   * @param {Array} failures - Array of failures
   * @returns {Object} - Confidence analysis
   */
  analyzeConfidence(failures) {
    const confidences = failures.map(f => f.confidence || 0);
    
    return {
      average: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      min: confidences.length > 0 ? Math.min(...confidences) : 0,
      max: confidences.length > 0 ? Math.max(...confidences) : 0,
      highConfidence: confidences.filter(c => c >= 80).length,
      mediumConfidence: confidences.filter(c => c >= 50 && c < 80).length,
      lowConfidence: confidences.filter(c => c < 50).length
    };
  }

  /**
   * Analyze pom.xml changes and their impact on compilation errors
   * @param {Object} pomChanges - pom.xml changes information
   * @param {Array} compilationErrors - Array of compilation errors
   * @returns {Object} - Analysis result
   */
  async analyzePomXmlImpact(pomChanges, compilationErrors) {
    const issues = [];
    
    if (!pomChanges || !pomChanges.changes) {
      return { issues: [] };
    }

    // Analyze each pom.xml change for potential impact
    for (const change of pomChanges.changes) {
      const impact = this.analyzeChangeImpact(change, compilationErrors);
      if (impact) {
        issues.push(impact);
      }
    }

    // Analyze dependency-related compilation errors
    const dependencyErrors = compilationErrors.filter(error => 
      error.type === 'compilation_error' && 
      (error.message.includes('cannot find symbol') || 
       error.message.includes('package') ||
       error.message.includes('import'))
    );

    for (const error of dependencyErrors) {
      const dependencyIssue = this.analyzeDependencyError(error, pomChanges);
      if (dependencyIssue) {
        issues.push(dependencyIssue);
      }
    }

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        dependencyIssues: issues.filter(i => i.type === 'dependency_breaking_change').length,
        buildIssues: issues.filter(i => i.type === 'build_config_issue').length,
        pomXmlIssues: issues.filter(i => i.type === 'pom_xml_issue').length
      }
    };
  }

  /**
   * Analyze the impact of a specific pom.xml change
   * @param {Object} change - pom.xml change
   * @param {Array} compilationErrors - Array of compilation errors
   * @returns {Object|null} - Impact analysis or null
   */
  analyzeChangeImpact(change, compilationErrors) {
    switch (change.type) {
      case 'dependency_change':
        return this.analyzeDependencyChangeImpact(change, compilationErrors);
      
      case 'version_change':
        return this.analyzeVersionChangeImpact(change, compilationErrors);
      
      case 'plugin_change':
        return this.analyzePluginChangeImpact(change, compilationErrors);
      
      case 'build_config_change':
        return this.analyzeBuildConfigChangeImpact(change, compilationErrors);
      
      default:
        return null;
    }
  }

  /**
   * Analyze dependency change impact
   * @param {Object} change - Dependency change
   * @param {Array} compilationErrors - Compilation errors
   * @returns {Object|null} - Impact analysis
   */
  analyzeDependencyChangeImpact(change, compilationErrors) {
    if (change.status === 'removed' && change.dependency) {
      // Check if removed dependency is causing compilation errors
      const relatedErrors = compilationErrors.filter(error => 
        error.message.includes(change.dependency.artifactId) ||
        error.message.includes(change.dependency.groupId)
      );

      if (relatedErrors.length > 0) {
        return {
          type: 'dependency_breaking_change',
          severity: 'high',
          confidence: 90,
          message: `Removed dependency ${change.dependency.groupId}:${change.dependency.artifactId} is causing compilation errors`,
          dependency: change.dependency,
          relatedErrors: relatedErrors.length,
          file: change.file,
          line: 0
        };
      }
    }

    return null;
  }

  /**
   * Analyze version change impact
   * @param {Object} change - Version change
   * @param {Array} compilationErrors - Compilation errors
   * @returns {Object|null} - Impact analysis
   */
  analyzeVersionChangeImpact(change, compilationErrors) {
    if (change.changeType === 'removed') {
      return {
        type: 'pom_xml_issue',
        severity: 'high',
        confidence: 85,
        message: `Version removed for dependency, which may cause compilation issues`,
        file: change.file,
        line: 0
      };
    }

    return null;
  }

  /**
   * Analyze plugin change impact
   * @param {Object} change - Plugin change
   * @param {Array} compilationErrors - Compilation errors
   * @returns {Object|null} - Impact analysis
   */
  analyzePluginChangeImpact(change, compilationErrors) {
    if (change.artifactId === 'maven-compiler-plugin') {
      return {
        type: 'build_config_issue',
        severity: 'medium',
        confidence: 75,
        message: `Maven compiler plugin configuration changed, may affect compilation`,
        plugin: change,
        file: change.file,
        line: 0
      };
    }

    return null;
  }

  /**
   * Analyze build configuration change impact
   * @param {Object} change - Build config change
   * @param {Array} compilationErrors - Compilation errors
   * @returns {Object|null} - Impact analysis
   */
  analyzeBuildConfigChangeImpact(change, compilationErrors) {
    return {
      type: 'build_config_issue',
      severity: 'medium',
      confidence: 70,
      message: `Build configuration changed: ${change.element}`,
      element: change.element,
      file: change.file,
      line: 0
    };
  }

  /**
   * Analyze dependency-related compilation error
   * @param {Object} error - Compilation error
   * @param {Object} pomChanges - pom.xml changes
   * @returns {Object|null} - Analysis result
   */
  analyzeDependencyError(error, pomChanges) {
    // Check if the error is related to any pom.xml changes
    for (const change of pomChanges.changes) {
      if (change.type === 'dependency_change' && change.dependency) {
        const dependency = change.dependency;
        
        // Check if error mentions the dependency
        if (error.message.includes(dependency.artifactId) ||
            error.message.includes(dependency.groupId)) {
          
          return {
            type: 'dependency_breaking_change',
            severity: 'high',
            confidence: 95,
            message: `Compilation error related to dependency change: ${dependency.groupId}:${dependency.artifactId}`,
            dependency: dependency,
            error: error,
            file: error.file,
            line: error.line
          };
        }
      }
    }

    return null;
  }
}
