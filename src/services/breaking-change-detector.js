import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Java Breaking Change Detector Service
 * 
 * Detects breaking changes in Java dependency updates by analyzing:
 * - Maven/Gradle build logs for compilation errors
 * - API signature changes in Java code
 * - Removed classes/methods from dependencies
 * - Dependency conflicts and version incompatibilities
 * 
 * Design Patterns Used:
 * - Strategy Pattern: Different detection strategies for Maven vs Gradle
 * - Template Method Pattern: Common detection workflow with build-tool-specific implementations
 * - Observer Pattern: Monitors build processes for changes
 * - Factory Pattern: Creates appropriate build validators
 */
export class BreakingChangeDetector {
  constructor(app, config = {}) {
    this.app = app;
    this.log = app.log;
    this.config = {
      buildTimeout: 300000, // 5 minutes
      maxRetries: 2,
      buildValidationEnabled: true,
      ...config
    };

    // Initialize Java-specific detection strategies
    this.detectionStrategies = new Map([
      ['maven', new MavenDetectionStrategy(app, this.config)],
      ['gradle', new GradleDetectionStrategy(app, this.config)]
    ]);

    // Initialize build validator
    this.buildValidator = new JavaBuildValidator(app, this.config);
  }

  /**
   * Detect breaking changes in Java repository
   * @param {Object} context - Probot context
   * @returns {Promise<Object>} - Breaking changes result
   */
  async detectBreakingChanges(context) {
    const { repository } = context.payload;
    
    try {
      this.log.info(`🔍 Detecting Java breaking changes in ${repository.full_name}`);
      
      // Step 1: Detect Java build tool (Maven or Gradle)
      const buildTool = await this.detectJavaBuildTool(context);
      
      // Step 2: Get detection strategy
      const strategy = this.detectionStrategies.get(buildTool);
      if (!strategy) {
        throw new Error(`Unsupported Java build tool: ${buildTool}`);
      }
      
      // Step 3: Run comprehensive build validation
      const buildValidation = await this.buildValidator.validateBuild(context, buildTool);
      
      // Step 4: Analyze build logs for breaking changes
      const breakingChanges = await strategy.analyzeBreakingChanges(buildValidation);
      
      // Step 5: Check for dependency conflicts
      const dependencyConflicts = await strategy.checkDependencyConflicts(context);
      
      // Step 6: Combine results
      const allChanges = [
        ...breakingChanges.changes,
        ...dependencyConflicts.changes
      ];
      
      const result = {
        hasBreakingChanges: allChanges.length > 0,
        changes: allChanges,
        buildValidation,
        buildTool,
        projectType: 'java',
        timestamp: new Date().toISOString()
      };
      
      this.log.info(`✅ Java breaking change detection completed: ${allChanges.length} changes found`);
      return result;
      
    } catch (error) {
      this.log.error(`❌ Java breaking change detection failed: ${error.message}`);
      return {
        hasBreakingChanges: false,
        changes: [],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if commits contain Java dependency updates
   * @param {Array} commits - Array of commits
   * @returns {Promise<boolean>} - True if Java dependency update detected
   */
  async isDependencyUpdate(commits) {
    try {
      for (const commit of commits) {
        // Check for Java dependency file changes
        const javaDependencyFiles = [
          'pom.xml', 
          'build.gradle', 
          'build.gradle.kts',
          'gradle.properties',
          'gradle/wrapper/gradle-wrapper.properties'
        ];
        
        for (const file of javaDependencyFiles) {
          if (commit.modified?.includes(file) || commit.added?.includes(file)) {
            this.log.info(`☕ Java dependency file change detected: ${file}`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      this.log.error(`❌ Error checking for Java dependency updates: ${error.message}`);
      return false;
    }
  }

  /**
   * Detect Java build tool based on repository contents
   * @param {Object} context - Probot context
   * @returns {Promise<string>} - Build tool (maven, gradle)
   */
  async detectJavaBuildTool(context) {
    const { repository } = context.payload;
    
    try {
      // Check for Maven project
      try {
        await context.octokit.rest.repos.getContent({
          owner: repository.owner.login,
          repo: repository.name,
          path: 'pom.xml'
        });
        this.log.info(`☕ Detected Maven project`);
        return 'maven';
      } catch (error) {
        // pom.xml not found, continue checking
      }
      
      // Check for Gradle project
      const gradleFiles = ['build.gradle', 'build.gradle.kts', 'gradlew'];
      for (const file of gradleFiles) {
        try {
          await context.octokit.rest.repos.getContent({
            owner: repository.owner.login,
            repo: repository.name,
            path: file
          });
          this.log.info(`🔨 Detected Gradle project`);
          return 'gradle';
        } catch (error) {
          // File not found, continue checking
        }
      }
      
      throw new Error('No supported Java build tool detected (Maven or Gradle required)');
      
    } catch (error) {
      this.log.error(`❌ Java build tool detection failed: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Java Build Validator
 * 
 * Validates Java builds and provides comprehensive build analysis
 */
class JavaBuildValidator {
  constructor(app, config) {
    this.app = app;
    this.log = app.log;
    this.config = config;
  }

  /**
   * Validate Java build with comprehensive analysis
   * @param {Object} context - Probot context
   * @param {string} buildTool - Build tool (maven, gradle)
   * @returns {Promise<Object>} - Build validation result
   */
  async validateBuild(context, buildTool) {
    try {
      this.log.info(`🔧 Validating Java build with ${buildTool}`);
      
      // Step 1: Clean build
      const cleanResult = await this.runCleanBuild(context, buildTool);
      
      // Step 2: Compile
      const compileResult = await this.runCompile(context, buildTool);
      
      // Step 3: Run tests
      const testResult = await this.runTests(context, buildTool);
      
      // Step 4: Analyze dependencies
      const dependencyResult = await this.analyzeDependencies(context, buildTool);
      
      // Step 5: Check for build failures
      const buildFailures = this.analyzeBuildFailures(cleanResult, compileResult, testResult);
      
      const result = {
        success: buildFailures.length === 0,
        buildFailures,
        cleanResult,
        compileResult,
        testResult,
        dependencyResult,
        buildTool,
        timestamp: new Date().toISOString()
      };
      
      this.log.info(`✅ Build validation completed: ${buildFailures.length} failures found`);
      return result;
      
    } catch (error) {
      this.log.error(`❌ Build validation failed: ${error.message}`);
      return {
        success: false,
        buildFailures: [{ type: 'validation_error', message: error.message }],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Run clean build
   * @param {Object} context - Probot context
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Clean result
   */
  async runCleanBuild(context, buildTool) {
    try {
      if (buildTool === 'maven') {
        return await this.executeCommand('mvn', ['clean'], '/tmp/test-repo');
      } else if (buildTool === 'gradle') {
        const gradleCommand = await this.getGradleCommand('/tmp/test-repo');
        return await this.executeCommand(gradleCommand, ['clean'], '/tmp/test-repo');
      }
    } catch (error) {
      return {
        success: false,
        logs: error.message,
        error: error.message
      };
    }
  }

  /**
   * Run compile
   * @param {Object} context - Probot context
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Compile result
   */
  async runCompile(context, buildTool) {
    try {
      if (buildTool === 'maven') {
        return await this.executeCommand('mvn', ['compile'], '/tmp/test-repo');
      } else if (buildTool === 'gradle') {
        const gradleCommand = await this.getGradleCommand('/tmp/test-repo');
        return await this.executeCommand(gradleCommand, ['compileJava'], '/tmp/test-repo');
      }
    } catch (error) {
      return {
        success: false,
        logs: error.message,
        error: error.message
      };
    }
  }

  /**
   * Run tests
   * @param {Object} context - Probot context
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Test result
   */
  async runTests(context, buildTool) {
    try {
      if (buildTool === 'maven') {
        return await this.executeCommand('mvn', ['test'], '/tmp/test-repo');
      } else if (buildTool === 'gradle') {
        const gradleCommand = await this.getGradleCommand('/tmp/test-repo');
        return await this.executeCommand(gradleCommand, ['test'], '/tmp/test-repo');
      }
    } catch (error) {
      return {
        success: false,
        logs: error.message,
        error: error.message
      };
    }
  }

  /**
   * Analyze dependencies
   * @param {Object} context - Probot context
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Dependency analysis result
   */
  async analyzeDependencies(context, buildTool) {
    try {
      if (buildTool === 'maven') {
        return await this.executeCommand('mvn', ['dependency:tree'], '/tmp/test-repo');
      } else if (buildTool === 'gradle') {
        const gradleCommand = await this.getGradleCommand('/tmp/test-repo');
        return await this.executeCommand(gradleCommand, ['dependencies'], '/tmp/test-repo');
      }
    } catch (error) {
      return {
        success: false,
        logs: error.message,
        error: error.message
      };
    }
  }

  /**
   * Analyze build failures from all build steps
   * @param {Object} cleanResult - Clean build result
   * @param {Object} compileResult - Compile result
   * @param {Object} testResult - Test result
   * @returns {Array} - Array of build failures
   */
  analyzeBuildFailures(cleanResult, compileResult, testResult) {
    const failures = [];
    
    // Analyze clean failures
    if (!cleanResult.success) {
      failures.push({
        type: 'clean_failure',
        message: 'Build clean failed',
        logs: cleanResult.logs,
        severity: 'high'
      });
    }
    
    // Analyze compile failures
    if (!compileResult.success) {
      const compileFailures = this.parseCompileFailures(compileResult.logs);
      failures.push(...compileFailures);
    }
    
    // Analyze test failures
    if (!testResult.success) {
      const testFailures = this.parseTestFailures(testResult.logs);
      failures.push(...testFailures);
    }
    
    return failures;
  }

  /**
   * Parse compile failures from build logs
   * @param {string} logs - Build logs
   * @returns {Array} - Array of compile failures
   */
  parseCompileFailures(logs) {
    const failures = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (this.isCompileFailure(line)) {
        failures.push({
          type: 'compile_failure',
          message: line.trim(),
          line: line,
          severity: this.assessCompileSeverity(line)
        });
      }
    }
    
    return failures;
  }

  /**
   * Parse test failures from build logs
   * @param {string} logs - Build logs
   * @returns {Array} - Array of test failures
   */
  parseTestFailures(logs) {
    const failures = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (this.isTestFailure(line)) {
        failures.push({
          type: 'test_failure',
          message: line.trim(),
          line: line,
          severity: 'medium'
        });
      }
    }
    
    return failures;
  }

  /**
   * Check if line indicates a compile failure
   * @param {string} line - Log line
   * @returns {boolean} - True if compile failure
   */
  isCompileFailure(line) {
    const compileFailurePatterns = [
      /\[ERROR\]/,
      /cannot find symbol/,
      /package does not exist/,
      /incompatible types/,
      /method cannot be applied/,
      /ClassNotFoundException/,
      /NoClassDefFoundError/,
      /method.*not found/,
      /class.*not found/,
      /incompatible.*version/,
      /dependency.*conflict/,
      /version.*conflict/
    ];

    return compileFailurePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if line indicates a test failure
   * @param {string} line - Log line
   * @returns {boolean} - True if test failure
   */
  isTestFailure(line) {
    const testFailurePatterns = [
      /Tests run: \d+, Failures: \d+/,
      /BUILD FAILED/,
      /Test.*failed/,
      /AssertionError/,
      /Test.*exception/
    ];

    return testFailurePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Assess severity of compile failure
   * @param {string} line - Log line
   * @returns {string} - Severity level
   */
  assessCompileSeverity(line) {
    if (line.includes('ClassNotFoundException') || line.includes('NoClassDefFoundError')) {
      return 'critical';
    }
    if (line.includes('cannot find symbol') || line.includes('method cannot be applied')) {
      return 'high';
    }
    if (line.includes('deprecated')) {
      return 'medium';
    }
    if (line.includes('warning')) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * Get Gradle command
   * @param {string} repoPath - Repository path
   * @returns {Promise<string>} - Gradle command
   */
  async getGradleCommand(repoPath) {
    try {
      await fs.access(path.join(repoPath, 'gradlew'));
      return './gradlew';
    } catch {
      return 'gradle';
    }
  }

  /**
   * Execute command with timeout and logging
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  async executeCommand(command, args, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.buildTimeout;
      
      this.log.debug(`Executing: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          logs: stdout + stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

/**
 * Base class for Java detection strategies
 */
class JavaDetectionStrategy {
  constructor(app, config) {
    this.app = app;
    this.log = app.log;
    this.config = config;
  }

  /**
   * Analyze breaking changes from build validation
   * @param {Object} buildValidation - Build validation result
   * @returns {Promise<Object>} - Breaking changes result
   */
  async analyzeBreakingChanges(buildValidation) {
    const changes = [];
    
    // Analyze build failures for breaking changes
    for (const failure of buildValidation.buildFailures) {
      if (failure.type === 'compile_failure') {
        const breakingChange = this.parseBreakingChange(failure.message);
        if (breakingChange) {
          changes.push(breakingChange);
        }
      }
    }
    
    // Analyze build logs for additional patterns
    const logChanges = this.parseBreakingChangesFromLogs(buildValidation);
    changes.push(...logChanges);
    
    return {
      hasBreakingChanges: changes.length > 0,
      changes,
      buildValidation
    };
  }

  /**
   * Parse breaking change from failure message
   * @param {string} message - Failure message
   * @returns {Object|null} - Breaking change object or null
   */
  parseBreakingChange(message) {
    const breakingChangePatterns = [
      {
        pattern: /cannot find symbol.*class\s+(\w+)/,
        type: 'removed_class_or_package',
        description: (match) => `Class ${match[1]} not found`
      },
      {
        pattern: /package\s+(\S+)\s+does not exist/,
        type: 'removed_class_or_package',
        description: (match) => `Package ${match[1]} does not exist`
      },
      {
        pattern: /method\s+(\w+)\s+cannot be applied/,
        type: 'api_signature_change',
        description: (match) => `Method ${match[1]} signature changed`
      },
      {
        pattern: /(\w+) is deprecated/,
        type: 'deprecated_api',
        description: (match) => `${match[1]} is deprecated`
      },
      {
        pattern: /incompatible types/,
        type: 'type_incompatibility',
        description: () => 'Type incompatibility detected'
      }
    ];

    for (const { pattern, type, description } of breakingChangePatterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          type,
          description: description(match),
          message,
          severity: this.assessSeverity(message)
        };
      }
    }

    return null;
  }

  /**
   * Parse breaking changes from build logs
   * @param {Object} buildValidation - Build validation result
   * @returns {Array} - Array of breaking changes
   */
  parseBreakingChangesFromLogs(buildValidation) {
    const changes = [];
    const allLogs = [
      buildValidation.compileResult?.logs || '',
      buildValidation.testResult?.logs || '',
      buildValidation.dependencyResult?.logs || ''
    ].join('\n');

    const lines = allLogs.split('\n');
    
    for (const line of lines) {
      if (this.isBreakingChangeLine(line)) {
        const change = this.parseBreakingChange(line);
        if (change) {
          changes.push(change);
        }
      }
    }
    
    return changes;
  }

  /**
   * Check if a line indicates a breaking change
   * @param {string} line - Log line
   * @returns {boolean} - True if breaking change
   */
  isBreakingChangeLine(line) {
    const breakingChangePatterns = [
      /cannot find symbol/,
      /package does not exist/,
      /incompatible types/,
      /method cannot be applied/,
      /deprecated/,
      /ClassNotFoundException/,
      /NoClassDefFoundError/,
      /method.*not found/,
      /class.*not found/,
      /incompatible.*version/,
      /dependency.*conflict/,
      /version.*conflict/
    ];

    return breakingChangePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Assess severity of breaking change
   * @param {string} message - Error message
   * @returns {string} - Severity level
   */
  assessSeverity(message) {
    if (message.includes('ClassNotFoundException') || message.includes('NoClassDefFoundError')) {
      return 'critical';
    }
    if (message.includes('cannot find symbol') || message.includes('method cannot be applied')) {
      return 'high';
    }
    if (message.includes('deprecated')) {
      return 'medium';
    }
    if (message.includes('warning')) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * Check for dependency conflicts
   * @param {Object} context - Probot context
   * @returns {Promise<Object>} - Dependency conflicts result
   */
  async checkDependencyConflicts(context) {
    // This will be implemented by specific strategies
    return {
      hasBreakingChanges: false,
      changes: []
    };
  }
}

/**
 * Maven detection strategy
 */
class MavenDetectionStrategy extends JavaDetectionStrategy {
  async checkDependencyConflicts(context) {
    try {
      // Check for Maven dependency conflicts
      const depResult = await this.executeCommand('mvn', ['dependency:tree'], '/tmp/test-repo');
      
      const conflicts = [];
      if (depResult.logs.includes('omitted for conflict')) {
        conflicts.push({
          type: 'maven_dependency_conflict',
          description: 'Maven dependency conflict detected',
          severity: 'high'
        });
      }
      
      return {
        hasBreakingChanges: conflicts.length > 0,
        changes: conflicts
      };
    } catch (error) {
      return {
        hasBreakingChanges: false,
        changes: []
      };
    }
  }

  /**
   * Execute command with timeout and logging
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  async executeCommand(command, args, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.buildTimeout;
      
      this.log.debug(`Executing: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          logs: stdout + stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

/**
 * Gradle detection strategy
 */
class GradleDetectionStrategy extends JavaDetectionStrategy {
  async checkDependencyConflicts(context) {
    try {
      // Check for Gradle dependency conflicts
      const gradleCommand = await this.getGradleCommand('/tmp/test-repo');
      const depResult = await this.executeCommand(gradleCommand, ['dependencies'], '/tmp/test-repo');
      
      const conflicts = [];
      if (depResult.logs.includes('conflict')) {
        conflicts.push({
          type: 'gradle_dependency_conflict',
          description: 'Gradle dependency conflict detected',
          severity: 'high'
        });
      }
      
      return {
        hasBreakingChanges: conflicts.length > 0,
        changes: conflicts
      };
    } catch (error) {
      return {
        hasBreakingChanges: false,
        changes: []
      };
    }
  }

  /**
   * Get Gradle command
   * @param {string} repoPath - Repository path
   * @returns {Promise<string>} - Gradle command
   */
  async getGradleCommand(repoPath) {
    try {
      await fs.access(path.join(repoPath, 'gradlew'));
      return './gradlew';
    } catch {
      return 'gradle';
    }
  }

  /**
   * Execute command with timeout and logging
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  async executeCommand(command, args, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.buildTimeout;
      
      this.log.debug(`Executing: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          logs: stdout + stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
} 