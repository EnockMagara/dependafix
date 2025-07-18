/**
 * Use Case Orchestrator
 * 
 * Orchestrates all dependency update use cases and coordinates fixes across handlers.
 */
import { DeprecatedMethodHandler } from './deprecated-method-handler.js';
import { ApiSignatureHandler } from './api-signature-handler.js';
import { DependencyScopeHandler } from './dependency-scope-handler.js';
import { RemovedClassesHandler } from './removed-classes-handler.js';
import { MultiFileChangesHandler } from './multi-file-changes-handler.js';
import { BuildValidator } from '../build-validator.js';

export class UseCaseOrchestrator {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
    
    // Initialize all handlers
    this.handlers = {
      deprecatedMethod: new DeprecatedMethodHandler(context, config),
      apiSignature: new ApiSignatureHandler(context, config),
      dependencyScope: new DependencyScopeHandler(context, config),
      removedClasses: new RemovedClassesHandler(context, config),
      multiFileChanges: new MultiFileChangesHandler(context, config)
    };
    
    // Initialize build validator - the critical validation step
    this.buildValidator = new BuildValidator(context, config);
  }

  /**
   * Orchestrate comprehensive dependency update fix process
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @param {Object} libraryInfo - Library version information
   * @returns {Promise<Object>} - Orchestrated fix results
   */
  async orchestrateDependencyUpdateFixes(buildLogs, repoPath, libraryInfo) {
    this.log.info('🎯 Starting comprehensive dependency update fix orchestration...');

    const results = {
      success: false,
      totalIssuesFound: 0,
      totalFixesApplied: 0,
      useCaseResults: {},
      finalValidation: null,
      summary: ''
    };

    try {
      // Phase 1: Detect all types of issues
      this.log.info('📊 Phase 1: Detecting all dependency update issues...');
      const detectionResults = await this.detectAllIssues(buildLogs, repoPath);
      results.totalIssuesFound = this.countTotalIssues(detectionResults);
      
      this.log.info(`📋 Found ${results.totalIssuesFound} total issues across all use cases`);

      // Phase 2: Generate coordinated fixes
      this.log.info('🔧 Phase 2: Generating coordinated fixes...');
      const fixResults = await this.generateCoordinatedFixes(
        detectionResults, 
        libraryInfo, 
        repoPath
      );

      // Phase 3: Apply fixes in optimal order
      this.log.info('⚡ Phase 3: Applying fixes in optimal order...');
      const applicationResults = await this.applyFixesInOrder(fixResults, repoPath);
      results.totalFixesApplied = applicationResults.totalApplied;
      results.useCaseResults = applicationResults.useCaseResults;

      // Phase 4: CRITICAL BUILD VALIDATION
      this.log.info('🔍 Phase 4: CRITICAL BUILD VALIDATION...');
      const buildTool = await this.detectBuildTool(repoPath);
      
      // Create fix context for validation
      const fixContext = {
        totalFixes: results.totalFixesApplied,
        useCaseResults: applicationResults.useCaseResults,
        isCritical: this.isCriticalUpdate(libraryInfo)
      };
      
      results.finalValidation = await this.buildValidator.validateFixes(repoPath, buildTool, fixContext);
      results.success = results.finalValidation.success;
      results.shouldCreatePR = results.finalValidation.shouldCreatePR;

      // Phase 5: Generate summary
      results.summary = this.generateSummary(results);

      if (results.shouldCreatePR) {
        this.log.info('🎉 BUILD VALIDATION PASSED - Ready for PR creation!');
      } else {
        this.log.warn('⚠️ BUILD VALIDATION FAILED - PR creation blocked');
      }

      return results;

    } catch (error) {
      this.log.error(`❌ Orchestration failed: ${error.message}`);
      results.summary = `Orchestration failed: ${error.message}`;
      return results;
    }
  }

  /**
   * Detect all types of issues across all handlers
   * @param {string} buildLogs - Build logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Detection results
   */
  async detectAllIssues(buildLogs, repoPath) {
    const detectionPromises = [
      this.handlers.deprecatedMethod.detectDeprecatedMethods(buildLogs, repoPath),
      this.handlers.apiSignature.detectApiSignatureChanges(buildLogs, repoPath),
      this.handlers.dependencyScope.detectDependencyScopeIssues(buildLogs, repoPath),
      this.handlers.removedClasses.detectRemovedClasses(buildLogs, repoPath),
      this.handlers.multiFileChanges.detectMultiFileChanges(buildLogs, repoPath)
    ];

    const [
      deprecatedMethods,
      apiSignatureChanges,
      dependencyScopeIssues,
      removedClasses,
      multiFileChanges
    ] = await Promise.all(detectionPromises);

    return {
      deprecatedMethods,
      apiSignatureChanges,
      dependencyScopeIssues,
      removedClasses,
      multiFileChanges
    };
  }

  /**
   * Generate coordinated fixes for all detected issues
   * @param {Object} detectionResults - Detection results
   * @param {Object} libraryInfo - Library information
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Fix results
   */
  async generateCoordinatedFixes(detectionResults, libraryInfo, repoPath) {
    const fixResults = {};

    // Generate fixes for each use case
    const fixPromises = [];

    // Deprecated methods
    if (detectionResults.deprecatedMethods.length > 0) {
      fixPromises.push(
        this.generateDeprecatedMethodFixes(
          detectionResults.deprecatedMethods, 
          libraryInfo
        ).then(fixes => ({ type: 'deprecatedMethod', fixes }))
      );
    }

    // API signature changes
    if (detectionResults.apiSignatureChanges.length > 0) {
      fixPromises.push(
        this.generateApiSignatureFixes(
          detectionResults.apiSignatureChanges, 
          libraryInfo
        ).then(fixes => ({ type: 'apiSignature', fixes }))
      );
    }

    // Dependency scope issues
    if (detectionResults.dependencyScopeIssues.length > 0) {
      fixPromises.push(
        this.generateDependencyScopeFixes(
          detectionResults.dependencyScopeIssues, 
          libraryInfo
        ).then(fixes => ({ type: 'dependencyScope', fixes }))
      );
    }

    // Removed classes
    if (detectionResults.removedClasses.length > 0) {
      fixPromises.push(
        this.generateRemovedClassFixes(
          detectionResults.removedClasses, 
          libraryInfo
        ).then(fixes => ({ type: 'removedClasses', fixes }))
      );
    }

    // Multi-file changes
    if (detectionResults.multiFileChanges.length > 0) {
      fixPromises.push(
        this.generateMultiFileChangesFixes(
          detectionResults.multiFileChanges, 
          libraryInfo, 
          repoPath
        ).then(fixes => ({ type: 'multiFileChanges', fixes }))
      );
    }

    const allFixes = await Promise.all(fixPromises);
    
    // Organize fixes by type
    for (const fixGroup of allFixes) {
      fixResults[fixGroup.type] = fixGroup.fixes;
    }

    return fixResults;
  }

  /**
   * Apply fixes in optimal order to minimize conflicts
   * @param {Object} fixResults - Fix results
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Application results
   */
  async applyFixesInOrder(fixResults, repoPath) {
    const applicationResults = {
      totalApplied: 0,
      useCaseResults: {}
    };

    // Define optimal application order
    const applicationOrder = [
      'dependencyScope',  // Fix build dependencies first
      'removedClasses',   // Replace removed classes
      'deprecatedMethod', // Fix deprecated methods
      'apiSignature',     // Adapt API signatures
      'multiFileChanges'  // Coordinate multi-file changes last
    ];

    for (const useCaseType of applicationOrder) {
      if (fixResults[useCaseType] && fixResults[useCaseType].length > 0) {
        this.log.info(`🔧 Applying ${useCaseType} fixes...`);
        
        try {
          const result = await this.applyUseCaseFixes(
            useCaseType, 
            fixResults[useCaseType], 
            repoPath
          );
          
          applicationResults.useCaseResults[useCaseType] = result;
          applicationResults.totalApplied += result.appliedCount;
          
          this.log.info(`✅ Applied ${result.appliedCount} ${useCaseType} fixes`);
          
        } catch (error) {
          this.log.error(`❌ Failed to apply ${useCaseType} fixes: ${error.message}`);
          applicationResults.useCaseResults[useCaseType] = {
            success: false,
            error: error.message,
            appliedCount: 0
          };
        }
      }
    }

    return applicationResults;
  }

  /**
   * Apply fixes for a specific use case type
   * @param {string} useCaseType - Use case type
   * @param {Array} fixes - Fixes to apply
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Application result
   */
  async applyUseCaseFixes(useCaseType, fixes, repoPath) {
    switch (useCaseType) {
      case 'deprecatedMethod':
        return await this.applyDeprecatedMethodFixes(fixes);
      case 'apiSignature':
        return await this.applyApiSignatureFixes(fixes);
      case 'dependencyScope':
        return await this.applyDependencyScopeFixes(fixes, repoPath);
      case 'removedClasses':
        return await this.applyRemovedClassFixes(fixes);
      case 'multiFileChanges':
        return await this.applyMultiFileChangesFixes(fixes);
      default:
        throw new Error(`Unknown use case type: ${useCaseType}`);
    }
  }

  /**
   * Determine if this is a critical update requiring strict validation
   * @param {Object} libraryInfo - Library information
   * @returns {boolean} - True if critical update
   */
  isCriticalUpdate(libraryInfo) {
    // Major version updates are critical
    if (libraryInfo.oldVersion && libraryInfo.newVersion) {
      const oldMajor = parseInt(libraryInfo.oldVersion.split('.')[0]);
      const newMajor = parseInt(libraryInfo.newVersion.split('.')[0]);
      if (newMajor > oldMajor) {
        return true;
      }
    }
    
    // Critical libraries
    const criticalLibraries = [
      'spring-boot',
      'hibernate',
      'junit',
      'jackson',
      'slf4j'
    ];
    
    return criticalLibraries.some(lib => 
      libraryInfo.name && libraryInfo.name.toLowerCase().includes(lib)
    );
  }

  // Individual fix generation methods
  async generateDeprecatedMethodFixes(deprecatedMethods, libraryInfo) {
    const fixes = [];
    for (const methodInfo of deprecatedMethods) {
      const fix = await this.handlers.deprecatedMethod.generateDeprecatedMethodFix(
        methodInfo, 
        libraryInfo
      );
      fixes.push(fix);
    }
    return fixes;
  }

  async generateApiSignatureFixes(apiSignatureChanges, libraryInfo) {
    const fixes = [];
    for (const signatureInfo of apiSignatureChanges) {
      const fix = await this.handlers.apiSignature.generateApiSignatureFix(
        signatureInfo, 
        libraryInfo
      );
      fixes.push(fix);
    }
    return fixes;
  }

  async generateDependencyScopeFixes(dependencyScopeIssues, libraryInfo) {
    const fixes = [];
    for (const scopeInfo of dependencyScopeIssues) {
      const fix = await this.handlers.dependencyScope.generateDependencyScopeFix(
        scopeInfo, 
        libraryInfo
      );
      fixes.push(fix);
    }
    return fixes;
  }

  async generateRemovedClassFixes(removedClasses, libraryInfo) {
    const fixes = [];
    for (const classInfo of removedClasses) {
      const fix = await this.handlers.removedClasses.generateRemovedClassFix(
        classInfo, 
        libraryInfo
      );
      fixes.push(fix);
    }
    return fixes;
  }

  async generateMultiFileChangesFixes(multiFileChanges, libraryInfo, repoPath) {
    const fixes = [];
    for (const multiFileChange of multiFileChanges) {
      const fileFixes = await this.handlers.multiFileChanges.generateMultiFileFixes(
        multiFileChange, 
        libraryInfo, 
        repoPath
      );
      fixes.push(...fileFixes);
    }
    return fixes;
  }

  // Individual fix application methods
  async applyDeprecatedMethodFixes(fixes) {
    let appliedCount = 0;
    for (const fix of fixes) {
      const applied = await this.handlers.deprecatedMethod.applyDeprecatedMethodFix(fix);
      if (applied) appliedCount++;
    }
    return { success: appliedCount > 0, appliedCount };
  }

  async applyApiSignatureFixes(fixes) {
    let appliedCount = 0;
    for (const fix of fixes) {
      const applied = await this.handlers.apiSignature.applyApiSignatureFix(fix);
      if (applied) appliedCount++;
    }
    return { success: appliedCount > 0, appliedCount };
  }

  async applyDependencyScopeFixes(fixes, repoPath) {
    let appliedCount = 0;
    for (const fix of fixes) {
      const applied = await this.handlers.dependencyScope.applyDependencyScopeFix(fix, repoPath);
      if (applied) appliedCount++;
    }
    return { success: appliedCount > 0, appliedCount };
  }

  async applyRemovedClassFixes(fixes) {
    let appliedCount = 0;
    for (const fix of fixes) {
      const applied = await this.handlers.removedClasses.applyRemovedClassFix(fix);
      if (applied) appliedCount++;
    }
    return { success: appliedCount > 0, appliedCount };
  }

  async applyMultiFileChangesFixes(fixes) {
    const result = await this.handlers.multiFileChanges.applyMultiFileFixes(fixes);
    return { 
      success: result.success, 
      appliedCount: result.appliedFixes.length 
    };
  }

  // Helper methods
  countTotalIssues(detectionResults) {
    return Object.values(detectionResults).reduce((total, issues) => {
      return total + (Array.isArray(issues) ? issues.length : 0);
    }, 0);
  }

  generateSummary(results) {
    const summary = [
      `🎯 Dependency Update Fix Orchestration Summary`,
      ``,
      `📊 Issues Found: ${results.totalIssuesFound}`,
      `🔧 Fixes Applied: ${results.totalFixesApplied}`,
      `✅ Build Status: ${results.success ? 'PASSED' : 'FAILED'}`,
      `📝 PR Creation: ${results.shouldCreatePR ? 'APPROVED' : 'BLOCKED'}`,
      ``,
      `📋 Use Case Results:`
    ];

    for (const [useCase, result] of Object.entries(results.useCaseResults)) {
      summary.push(`  • ${useCase}: ${result.appliedCount} fixes applied`);
    }

    if (results.finalValidation) {
      summary.push(``, `🔍 Build Validation Results:`);
      summary.push(`  • Build Status: ${results.finalValidation.buildPassed ? 'PASSED' : 'FAILED'}`);
      summary.push(`  • Tests Status: ${results.finalValidation.testsPassed ? 'PASSED' : 'FAILED'}`);
      summary.push(`  • PR Recommended: ${results.finalValidation.shouldCreatePR ? 'YES' : 'NO'}`);
      
      if (results.finalValidation.testResults && results.finalValidation.testResults.totalTests > 0) {
        const tests = results.finalValidation.testResults;
        summary.push(`  • Test Results: ${tests.passedTests}/${tests.totalTests} passed`);
      }
      
      if (results.finalValidation.errors && results.finalValidation.errors.length > 0) {
        summary.push(`  • Errors: ${results.finalValidation.errors.length}`);
      }
      
      if (results.finalValidation.warnings && results.finalValidation.warnings.length > 0) {
        summary.push(`  • Warnings: ${results.finalValidation.warnings.length}`);
      }
    }

    return summary.join('\n');
  }

  extractTestResults(buildLogs) {
    const testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0
    };

    // Maven test results
    const mavenMatch = buildLogs.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/);
    if (mavenMatch) {
      testResults.totalTests = parseInt(mavenMatch[1]);
      testResults.failedTests = parseInt(mavenMatch[2]) + parseInt(mavenMatch[3]);
      testResults.skippedTests = parseInt(mavenMatch[4]);
      testResults.passedTests = testResults.totalTests - testResults.failedTests - testResults.skippedTests;
    }

    // Gradle test results
    const gradleMatch = buildLogs.match(/(\d+) tests completed, (\d+) failed, (\d+) skipped/);
    if (gradleMatch) {
      testResults.totalTests = parseInt(gradleMatch[1]);
      testResults.failedTests = parseInt(gradleMatch[2]);
      testResults.skippedTests = parseInt(gradleMatch[3]);
      testResults.passedTests = testResults.totalTests - testResults.failedTests - testResults.skippedTests;
    }

    return testResults;
  }

  async detectBuildTool(repoPath) {
    const fs = await import('fs/promises');
    
    try {
      const files = await fs.readdir(repoPath);
      
      if (files.includes('pom.xml')) {
        return 'maven';
      }
      
      if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
        return 'gradle';
      }

      return 'unknown';
    } catch (error) {
      this.log.error(`Error detecting build tool: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * Create comprehensive pull request for all fixes
   * @param {Object} orchestrationResults - Orchestration results
   * @param {Object} libraryInfo - Library information
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - PR creation result
   */
  async createComprehensivePullRequest(orchestrationResults, libraryInfo, repoPath) {
    this.log.info('📝 Evaluating pull request creation...');

    // CRITICAL CHECK: Only create PR if build validation passed
    if (!orchestrationResults.shouldCreatePR) {
      this.log.error('❌ BUILD VALIDATION FAILED - PR creation blocked');
      return { 
        success: false, 
        error: 'Build validation failed - cannot create pull request',
        validationReport: this.buildValidator.generateValidationReport(orchestrationResults.finalValidation)
      };
    }

    this.log.info('✅ Build validation passed - proceeding with PR creation');

    try {
      const { PullRequestCreator } = await import('../dependafix/pull-request-creator.js');
      const prCreator = new PullRequestCreator(this.context, this.config);

      const prData = {
        title: `Fix breaking changes from ${libraryInfo.name} ${libraryInfo.oldVersion} → ${libraryInfo.newVersion}`,
        body: this.buildPullRequestBody(orchestrationResults, libraryInfo),
        branch: `dependafix/${libraryInfo.name}-${libraryInfo.newVersion}-fixes`,
        labels: ['dependafix', 'breaking-changes', 'automated-fix', 'build-validated']
      };

      const prResult = await prCreator.createPullRequest(prData);
      
      if (prResult.success) {
        this.log.info('🎉 Pull request created successfully with validated fixes!');
      }
      
      return prResult;

    } catch (error) {
      this.log.error(`❌ Failed to create pull request: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  buildPullRequestBody(orchestrationResults, libraryInfo) {
    const body = [
      `# 🔧 Dependency Update Fixes: ${libraryInfo.name} ${libraryInfo.oldVersion} → ${libraryInfo.newVersion}`,
      ``,
      `This PR automatically fixes breaking changes introduced by updating ${libraryInfo.name} from version ${libraryInfo.oldVersion} to ${libraryInfo.newVersion}.`,
      ``,
      `## 📊 Summary`,
      `- **Issues Found**: ${orchestrationResults.totalIssuesFound}`,
      `- **Fixes Applied**: ${orchestrationResults.totalFixesApplied}`,
      `- **Final Status**: ${orchestrationResults.success ? '✅ SUCCESS' : '❌ FAILED'}`,
      ``,
      `## 🔍 Use Cases Addressed`,
      ``
    ];

    for (const [useCase, result] of Object.entries(orchestrationResults.useCaseResults)) {
      const useCaseNames = {
        deprecatedMethod: 'Deprecated Method Replacement',
        apiSignature: 'API Signature Adaptation',
        dependencyScope: 'Dependency Scope Resolution',
        removedClasses: 'Removed Class Replacement',
        multiFileChanges: 'Multi-File Synchronization'
      };

      body.push(`### ${useCaseNames[useCase] || useCase}`);
      body.push(`- **Fixes Applied**: ${result.appliedCount}`);
      body.push(`- **Status**: ${result.success ? '✅ Success' : '❌ Failed'}`);
      body.push(``);
    }

    if (orchestrationResults.finalValidation) {
      body.push(`## 🔍 Build Validation Results`);
      body.push(`- **Build Status**: ${orchestrationResults.finalValidation.buildPassed ? '✅ PASSED' : '❌ FAILED'}`);
      body.push(`- **Tests Status**: ${orchestrationResults.finalValidation.testsPassed ? '✅ PASSED' : '❌ FAILED'}`);
      body.push(`- **PR Approved**: ${orchestrationResults.finalValidation.shouldCreatePR ? '✅ YES' : '❌ NO'}`);
      
      if (orchestrationResults.finalValidation.testResults && orchestrationResults.finalValidation.testResults.totalTests > 0) {
        const tests = orchestrationResults.finalValidation.testResults;
        body.push(`- **Test Results**: ${tests.passedTests}/${tests.totalTests} passed, ${tests.failedTests} failed, ${tests.skippedTests} skipped`);
      }
      
      if (orchestrationResults.finalValidation.errors && orchestrationResults.finalValidation.errors.length > 0) {
        body.push(`- **Errors**: ${orchestrationResults.finalValidation.errors.length} found`);
      }
      
      if (orchestrationResults.finalValidation.warnings && orchestrationResults.finalValidation.warnings.length > 0) {
        body.push(`- **Warnings**: ${orchestrationResults.finalValidation.warnings.length} found`);
      }
      
      body.push(``);
      body.push(`### 📋 Validation Details`);
      body.push(`This PR was created only after comprehensive build validation:`);
      body.push(`1. ✅ Clean build compilation successful`);
      body.push(`2. ✅ All tests executed and analyzed`);
      body.push(`3. ✅ Dependencies validated`);
      body.push(`4. ✅ Code quality checks passed`);
      body.push(`5. ✅ Overall validation approved PR creation`);
      body.push(``);
    }

    body.push(`## 🤖 Automated by Dependafix`);
    body.push(`This PR was automatically generated by the Dependafix system using advanced LLM-powered code analysis.`);
    body.push(`All changes have been validated through automated testing.`);

    return body.join('\n');
  }
} 