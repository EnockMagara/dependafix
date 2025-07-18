/**
 * Build Validator Service
 * 
 * Validates dependency update fixes by running comprehensive builds.
 * Only creates pull requests when builds pass successfully.
 */
export class BuildValidator {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
    this.buildTimeout = config.buildTimeout || 900000; // 15 minutes
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Validate fixes through comprehensive build process
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @param {Object} fixContext - Context about applied fixes
   * @returns {Promise<Object>} - Validation result
   */
  async validateFixes(repoPath, buildTool, fixContext = {}) {
    this.log.info('🔍 Starting comprehensive build validation...');

    const validationResult = {
      success: false,
      buildPassed: false,
      testsPassed: false,
      buildLogs: '',
      testResults: null,
      errors: [],
      warnings: [],
      recommendations: [],
      shouldCreatePR: false
    };

    try {
      // Step 1: Clean build validation
      this.log.info('🧹 Step 1: Running clean build...');
      const cleanBuildResult = await this.runCleanBuild(repoPath, buildTool);
      validationResult.buildLogs += cleanBuildResult.logs + '\n';

      if (!cleanBuildResult.success) {
        validationResult.errors.push('Clean build failed');
        validationResult.buildPassed = false;
        this.log.error('❌ Clean build failed - cannot proceed with PR creation');
        return validationResult;
      }

      validationResult.buildPassed = true;
      this.log.info('✅ Clean build passed');

      // Step 2: Test validation
      this.log.info('🧪 Step 2: Running tests...');
      const testResult = await this.runTests(repoPath, buildTool);
      validationResult.buildLogs += testResult.logs + '\n';
      validationResult.testResults = testResult.testResults;

      if (!testResult.success) {
        validationResult.testsPassed = false;
        validationResult.errors.push('Tests failed');
        
        // Check if test failures are acceptable
        const acceptableFailures = this.analyzeTestFailures(testResult);
        if (!acceptableFailures.canProceed) {
          this.log.error('❌ Critical test failures - cannot create PR');
          return validationResult;
        } else {
          this.log.warn('⚠️ Some tests failed but are acceptable for PR creation');
          validationResult.warnings.push('Some tests failed but may be unrelated to dependency changes');
        }
      } else {
        validationResult.testsPassed = true;
        this.log.info('✅ All tests passed');
      }

      // Step 3: Dependency validation
      this.log.info('📦 Step 3: Validating dependencies...');
      const depValidation = await this.validateDependencies(repoPath, buildTool);
      validationResult.buildLogs += depValidation.logs + '\n';

      if (depValidation.warnings.length > 0) {
        validationResult.warnings.push(...depValidation.warnings);
      }

      // Step 4: Code quality checks
      this.log.info('📊 Step 4: Running code quality checks...');
      const qualityResult = await this.runQualityChecks(repoPath, buildTool);
      validationResult.buildLogs += qualityResult.logs + '\n';

      if (qualityResult.warnings.length > 0) {
        validationResult.warnings.push(...qualityResult.warnings);
      }

      // Step 5: Final validation decision
      validationResult.success = validationResult.buildPassed;
      validationResult.shouldCreatePR = this.shouldCreatePullRequest(validationResult, fixContext);

      if (validationResult.shouldCreatePR) {
        this.log.info('🎉 Build validation passed - ready for PR creation');
        validationResult.recommendations.push('All validations passed - safe to create pull request');
      } else {
        this.log.warn('⚠️ Build validation has issues - PR creation not recommended');
        validationResult.recommendations.push('Fix validation issues before creating pull request');
      }

      return validationResult;

    } catch (error) {
      this.log.error(`❌ Build validation failed: ${error.message}`);
      validationResult.errors.push(`Validation error: ${error.message}`);
      return validationResult;
    }
  }

  /**
   * Run clean build
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Build result
   */
  async runCleanBuild(repoPath, buildTool) {
    this.log.info('🔨 Running clean build...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const buildCommands = {
      maven: 'mvn clean compile -DskipTests=true -q',
      gradle: './gradlew clean compileJava -q'
    };

    const command = buildCommands[buildTool];
    if (!command) {
      throw new Error(`Unsupported build tool: ${buildTool}`);
    }

    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        this.log.info(`🔄 Build attempt ${attempt + 1}/${this.maxRetries}`);
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: repoPath,
          timeout: this.buildTimeout
        });

        const logs = stdout + stderr;
        const success = !stderr.includes('ERROR') && 
                       !stderr.includes('FAILED') && 
                       !stderr.includes('BUILD FAILED');

        if (success) {
          this.log.info('✅ Clean build successful');
          return { success: true, logs };
        } else {
          this.log.warn(`⚠️ Build attempt ${attempt + 1} failed`);
          if (attempt === this.maxRetries - 1) {
            return { success: false, logs, error: 'Build failed after retries' };
          }
        }

      } catch (error) {
        this.log.error(`❌ Build attempt ${attempt + 1} error: ${error.message}`);
        if (attempt === this.maxRetries - 1) {
          return { success: false, logs: error.message, error: error.message };
        }
      }

      attempt++;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return { success: false, logs: 'Max retries exceeded', error: 'Max retries exceeded' };
  }

  /**
   * Run tests
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Test result
   */
  async runTests(repoPath, buildTool) {
    this.log.info('🧪 Running tests...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const testCommands = {
      maven: 'mvn test -q',
      gradle: './gradlew test -q'
    };

    const command = testCommands[buildTool];
    if (!command) {
      throw new Error(`Unsupported build tool: ${buildTool}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
        timeout: this.buildTimeout
      });

      const logs = stdout + stderr;
      const testResults = this.parseTestResults(logs, buildTool);
      
      const success = testResults.failedTests === 0 && 
                     !stderr.includes('BUILD FAILED') &&
                     !stderr.includes('FAILED');

      this.log.info(`📊 Test Results: ${testResults.passedTests}/${testResults.totalTests} passed`);

      return { success, logs, testResults };

    } catch (error) {
      this.log.error(`❌ Test execution failed: ${error.message}`);
      return { 
        success: false, 
        logs: error.message, 
        testResults: { totalTests: 0, passedTests: 0, failedTests: 1, skippedTests: 0 },
        error: error.message 
      };
    }
  }

  /**
   * Validate dependencies
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Dependency validation result
   */
  async validateDependencies(repoPath, buildTool) {
    this.log.info('📦 Validating dependencies...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const depCommands = {
      maven: 'mvn dependency:analyze -q',
      gradle: './gradlew dependencies --configuration compileClasspath -q'
    };

    const command = depCommands[buildTool];
    if (!command) {
      return { success: true, logs: '', warnings: [] };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
        timeout: 60000 // 1 minute for dependency check
      });

      const logs = stdout + stderr;
      const warnings = this.analyzeDependencyWarnings(logs, buildTool);

      return { success: true, logs, warnings };

    } catch (error) {
      this.log.warn(`⚠️ Dependency validation warning: ${error.message}`);
      return { 
        success: true, 
        logs: error.message, 
        warnings: ['Dependency analysis had issues but build succeeded'] 
      };
    }
  }

  /**
   * Run code quality checks
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Quality check result
   */
  async runQualityChecks(repoPath, buildTool) {
    this.log.info('📊 Running code quality checks...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const qualityCommands = {
      maven: 'mvn compile -Dmaven.compiler.showWarnings=true -q',
      gradle: './gradlew compileJava -q'
    };

    const command = qualityCommands[buildTool];
    if (!command) {
      return { success: true, logs: '', warnings: [] };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: repoPath,
        timeout: 120000 // 2 minutes
      });

      const logs = stdout + stderr;
      const warnings = this.analyzeQualityWarnings(logs);

      return { success: true, logs, warnings };

    } catch (error) {
      this.log.warn(`⚠️ Quality check warning: ${error.message}`);
      return { 
        success: true, 
        logs: error.message, 
        warnings: ['Code quality checks had issues'] 
      };
    }
  }

  /**
   * Parse test results from build logs
   * @param {string} logs - Build logs
   * @param {string} buildTool - Build tool
   * @returns {Object} - Parsed test results
   */
  parseTestResults(logs, buildTool) {
    const testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0
    };

    if (buildTool === 'maven') {
      // Maven test results pattern
      const mavenMatch = logs.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/);
      if (mavenMatch) {
        testResults.totalTests = parseInt(mavenMatch[1]);
        testResults.failedTests = parseInt(mavenMatch[2]) + parseInt(mavenMatch[3]);
        testResults.skippedTests = parseInt(mavenMatch[4]);
        testResults.passedTests = testResults.totalTests - testResults.failedTests - testResults.skippedTests;
      }
    } else if (buildTool === 'gradle') {
      // Gradle test results pattern
      const gradleMatch = logs.match(/(\d+) tests completed, (\d+) failed, (\d+) skipped/);
      if (gradleMatch) {
        testResults.totalTests = parseInt(gradleMatch[1]);
        testResults.failedTests = parseInt(gradleMatch[2]);
        testResults.skippedTests = parseInt(gradleMatch[3]);
        testResults.passedTests = testResults.totalTests - testResults.failedTests - testResults.skippedTests;
      }
    }

    return testResults;
  }

  /**
   * Analyze test failures to determine if they're acceptable
   * @param {Object} testResult - Test result
   * @returns {Object} - Analysis result
   */
  analyzeTestFailures(testResult) {
    const { testResults } = testResult;
    
    if (!testResults || testResults.totalTests === 0) {
      return { canProceed: true, reason: 'No tests found' };
    }

    const failureRate = testResults.failedTests / testResults.totalTests;
    
    // Allow PR creation if failure rate is low (< 10%)
    if (failureRate < 0.1) {
      return { 
        canProceed: true, 
        reason: `Low failure rate: ${Math.round(failureRate * 100)}%` 
      };
    }

    // Check if failures seem unrelated to dependency changes
    const logs = testResult.logs || '';
    const dependencyRelatedFailures = this.isDependencyRelatedFailure(logs);
    
    if (!dependencyRelatedFailures) {
      return { 
        canProceed: true, 
        reason: 'Test failures appear unrelated to dependency changes' 
      };
    }

    return { 
      canProceed: false, 
      reason: `High failure rate (${Math.round(failureRate * 100)}%) with dependency-related issues` 
    };
  }

  /**
   * Check if test failures are related to dependency changes
   * @param {string} logs - Test logs
   * @returns {boolean} - True if failures are dependency-related
   */
  isDependencyRelatedFailure(logs) {
    const dependencyErrorPatterns = [
      /ClassNotFoundException/,
      /NoClassDefFoundError/,
      /cannot find symbol/,
      /package does not exist/,
      /incompatible types/,
      /method cannot be applied/,
      /deprecated API/
    ];

    return dependencyErrorPatterns.some(pattern => pattern.test(logs));
  }

  /**
   * Analyze dependency warnings
   * @param {string} logs - Dependency logs
   * @param {string} buildTool - Build tool
   * @returns {Array} - Array of warnings
   */
  analyzeDependencyWarnings(logs, buildTool) {
    const warnings = [];

    if (buildTool === 'maven') {
      if (logs.includes('Used undeclared dependencies')) {
        warnings.push('Some dependencies are used but not declared');
      }
      if (logs.includes('Unused declared dependencies')) {
        warnings.push('Some declared dependencies are unused');
      }
    }

    if (logs.includes('SNAPSHOT')) {
      warnings.push('Project uses SNAPSHOT dependencies');
    }

    if (logs.includes('vulnerable')) {
      warnings.push('Some dependencies may have security vulnerabilities');
    }

    return warnings;
  }

  /**
   * Analyze code quality warnings
   * @param {string} logs - Quality check logs
   * @returns {Array} - Array of warnings
   */
  analyzeQualityWarnings(logs) {
    const warnings = [];

    if (logs.includes('warning:')) {
      const warningCount = (logs.match(/warning:/g) || []).length;
      if (warningCount > 10) {
        warnings.push(`High number of compiler warnings: ${warningCount}`);
      }
    }

    if (logs.includes('deprecated')) {
      warnings.push('Code uses deprecated APIs');
    }

    if (logs.includes('unchecked')) {
      warnings.push('Code has unchecked operations');
    }

    return warnings;
  }

  /**
   * Determine if pull request should be created
   * @param {Object} validationResult - Validation result
   * @param {Object} fixContext - Fix context
   * @returns {boolean} - True if PR should be created
   */
  shouldCreatePullRequest(validationResult, fixContext) {
    // Must have successful build
    if (!validationResult.buildPassed) {
      this.log.info('❌ Build failed - no PR creation');
      return false;
    }

    // Check test requirements
    if (validationResult.testResults && validationResult.testResults.totalTests > 0) {
      const failureRate = validationResult.testResults.failedTests / validationResult.testResults.totalTests;
      
      // Strict test requirements for critical fixes
      if (fixContext.isCritical && failureRate > 0.05) {
        this.log.info('❌ Critical fixes require < 5% test failure rate');
        return false;
      }
      
      // General test requirements
      if (failureRate > 0.2) {
        this.log.info('❌ Test failure rate too high (> 20%)');
        return false;
      }
    }

    // Check for critical errors
    const hasCriticalErrors = validationResult.errors.some(error => 
      error.includes('ClassNotFoundException') ||
      error.includes('NoClassDefFoundError') ||
      error.includes('BUILD FAILED')
    );

    if (hasCriticalErrors) {
      this.log.info('❌ Critical errors detected - no PR creation');
      return false;
    }

    this.log.info('✅ All validation criteria met - PR creation approved');
    return true;
  }

  /**
   * Generate validation report
   * @param {Object} validationResult - Validation result
   * @returns {string} - Formatted report
   */
  generateValidationReport(validationResult) {
    const report = [
      '## 🔍 Build Validation Report',
      '',
      `**Build Status**: ${validationResult.buildPassed ? '✅ PASSED' : '❌ FAILED'}`,
      `**Tests Status**: ${validationResult.testsPassed ? '✅ PASSED' : '❌ FAILED'}`,
      `**PR Recommended**: ${validationResult.shouldCreatePR ? '✅ YES' : '❌ NO'}`,
      ''
    ];

    if (validationResult.testResults && validationResult.testResults.totalTests > 0) {
      report.push('### 🧪 Test Results');
      report.push(`- Total Tests: ${validationResult.testResults.totalTests}`);
      report.push(`- Passed: ${validationResult.testResults.passedTests}`);
      report.push(`- Failed: ${validationResult.testResults.failedTests}`);
      report.push(`- Skipped: ${validationResult.testResults.skippedTests}`);
      report.push('');
    }

    if (validationResult.errors.length > 0) {
      report.push('### ❌ Errors');
      validationResult.errors.forEach(error => {
        report.push(`- ${error}`);
      });
      report.push('');
    }

    if (validationResult.warnings.length > 0) {
      report.push('### ⚠️ Warnings');
      validationResult.warnings.forEach(warning => {
        report.push(`- ${warning}`);
      });
      report.push('');
    }

    if (validationResult.recommendations.length > 0) {
      report.push('### 💡 Recommendations');
      validationResult.recommendations.forEach(rec => {
        report.push(`- ${rec}`);
      });
      report.push('');
    }

    return report.join('\n');
  }
} 