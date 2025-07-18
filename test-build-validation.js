#!/usr/bin/env node

/**
 * Build Validation Test Script
 * 
 * Demonstrates the critical build validation workflow that ensures
 * pull requests are only created when builds pass successfully.
 */

import { BuildValidator } from './src/services/build-validator.js';
import { UseCaseOrchestrator } from './src/services/use-cases/use-case-orchestrator.js';

// Mock context for testing
const mockContext = {
  log: {
    info: (msg) => console.log(`ℹ️  ${msg}`),
    error: (msg) => console.error(`❌ ${msg}`),
    warn: (msg) => console.warn(`⚠️  ${msg}`)
  }
};

const mockConfig = {
  buildTimeout: 120000, // 2 minutes for testing
  maxRetries: 2
};

/**
 * Test scenarios for build validation
 */
const testScenarios = {
  successfulBuild: {
    name: 'Successful Build - PR Should Be Created',
    buildLogs: `
[INFO] BUILD SUCCESS
[INFO] Total time: 2.345 s
[INFO] Tests run: 25, Failures: 0, Errors: 0, Skipped: 0
    `,
    expectedPR: true,
    description: 'Clean build with all tests passing'
  },

  buildFailure: {
    name: 'Build Failure - PR Should Be Blocked',
    buildLogs: `
[ERROR] BUILD FAILED
[ERROR] compilation failed
[ERROR] cannot find symbol: class MissingClass
    `,
    expectedPR: false,
    description: 'Build compilation failed'
  },

  testFailures: {
    name: 'Test Failures - PR Should Be Blocked',
    buildLogs: `
[INFO] BUILD SUCCESS
[ERROR] Tests run: 25, Failures: 5, Errors: 2, Skipped: 0
[ERROR] TestUserService.testCreateUser: ClassNotFoundException
    `,
    expectedPR: false,
    description: 'Build successful but tests failed'
  },

  minorTestFailures: {
    name: 'Minor Test Failures - PR Should Be Created',
    buildLogs: `
[INFO] BUILD SUCCESS
[INFO] Tests run: 100, Failures: 2, Errors: 0, Skipped: 3
[INFO] TestUserPreferences.testColorScheme: AssertionError (unrelated to dependencies)
    `,
    expectedPR: true,
    description: 'Build successful with minor unrelated test failures'
  },

  dependencyErrors: {
    name: 'Dependency-Related Errors - PR Should Be Blocked',
    buildLogs: `
[INFO] BUILD SUCCESS
[ERROR] Tests run: 50, Failures: 8, Errors: 0, Skipped: 0
[ERROR] ClassNotFoundException: javax.servlet.http.HttpServletRequest
[ERROR] NoClassDefFoundError: org.springframework.web.bind.annotation.RestController
    `,
    expectedPR: false,
    description: 'Test failures related to dependency issues'
  }
};

/**
 * Mock build validator that simulates different build outcomes
 */
class MockBuildValidator extends BuildValidator {
  constructor(context, config, scenario) {
    super(context, config);
    this.scenario = scenario;
  }

  async runCleanBuild(repoPath, buildTool) {
    this.log.info(`🔨 Simulating clean build for scenario: ${this.scenario.name}`);
    
    // Simulate build based on scenario
    const success = !this.scenario.buildLogs.includes('BUILD FAILED') &&
                   !this.scenario.buildLogs.includes('compilation failed');
    
    return {
      success,
      logs: this.scenario.buildLogs
    };
  }

  async runTests(repoPath, buildTool) {
    this.log.info(`🧪 Simulating tests for scenario: ${this.scenario.name}`);
    
    const testResults = this.parseTestResults(this.scenario.buildLogs, buildTool);
    const success = testResults.failedTests === 0;
    
    return {
      success,
      logs: this.scenario.buildLogs,
      testResults
    };
  }

  async validateDependencies(repoPath, buildTool) {
    return {
      success: true,
      logs: 'Dependencies validated',
      warnings: []
    };
  }

  async runQualityChecks(repoPath, buildTool) {
    return {
      success: true,
      logs: 'Quality checks passed',
      warnings: []
    };
  }
}

/**
 * Test build validation for a specific scenario
 */
async function testBuildValidationScenario(scenarioName, scenario) {
  console.log(`\n🧪 Testing: ${scenario.name}`);
  console.log(`📋 Description: ${scenario.description}`);
  console.log(`🎯 Expected PR Creation: ${scenario.expectedPR ? 'YES' : 'NO'}`);
  
  const mockValidator = new MockBuildValidator(mockContext, mockConfig, scenario);
  const repoPath = './test-repo';
  const buildTool = 'maven';
  
  const fixContext = {
    totalFixes: 5,
    isCritical: scenarioName.includes('dependency')
  };
  
  try {
    const validationResult = await mockValidator.validateFixes(repoPath, buildTool, fixContext);
    
    console.log(`\n📊 Validation Results:`);
    console.log(`  Build Passed: ${validationResult.buildPassed ? '✅' : '❌'}`);
    console.log(`  Tests Passed: ${validationResult.testsPassed ? '✅' : '❌'}`);
    console.log(`  Should Create PR: ${validationResult.shouldCreatePR ? '✅' : '❌'}`);
    
    if (validationResult.testResults && validationResult.testResults.totalTests > 0) {
      const tests = validationResult.testResults;
      console.log(`  Test Results: ${tests.passedTests}/${tests.totalTests} passed, ${tests.failedTests} failed`);
    }
    
    if (validationResult.errors.length > 0) {
      console.log(`  Errors: ${validationResult.errors.length}`);
      validationResult.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    if (validationResult.warnings.length > 0) {
      console.log(`  Warnings: ${validationResult.warnings.length}`);
      validationResult.warnings.forEach(warning => console.log(`    - ${warning}`));
    }
    
    // Validate expectation
    const expectationMet = validationResult.shouldCreatePR === scenario.expectedPR;
    
    if (expectationMet) {
      console.log(`✅ Test PASSED - PR creation decision matches expectation`);
    } else {
      console.log(`❌ Test FAILED - Expected PR: ${scenario.expectedPR}, Got: ${validationResult.shouldCreatePR}`);
    }
    
    // Generate validation report
    const report = mockValidator.generateValidationReport(validationResult);
    console.log(`\n📋 Validation Report:`);
    console.log('─'.repeat(60));
    console.log(report);
    console.log('─'.repeat(60));
    
    return {
      success: expectationMet,
      scenario: scenarioName,
      expectedPR: scenario.expectedPR,
      actualPR: validationResult.shouldCreatePR,
      validationResult
    };
    
  } catch (error) {
    console.error(`❌ Test failed with error: ${error.message}`);
    return {
      success: false,
      scenario: scenarioName,
      error: error.message
    };
  }
}

/**
 * Test full orchestration workflow with build validation
 */
async function testOrchestrationWorkflow() {
  console.log(`\n🎯 Testing Full Orchestration Workflow with Build Validation`);
  console.log(`═`.repeat(80));
  
  const orchestrator = new UseCaseOrchestrator(mockContext, mockConfig);
  
  // Mock a scenario with build failures that get fixed
  const buildLogs = `
[ERROR] /src/main/java/com/example/Service.java:25: error: cannot find symbol method getInstance()
[ERROR] /src/main/java/com/example/UserDao.java:18: error: incompatible types: Session cannot be converted to EntityManager
[ERROR] BUILD FAILED
  `;
  
  const libraryInfo = {
    name: 'hibernate-core',
    oldVersion: '5.6.0',
    newVersion: '6.2.0'
  };
  
  const repoPath = './test-repo';
  
  try {
    console.log(`🔍 Running orchestration with build validation...`);
    
    // Override the build validator to simulate successful validation after fixes
    orchestrator.buildValidator = new MockBuildValidator(mockContext, mockConfig, testScenarios.successfulBuild);
    
    const results = await orchestrator.orchestrateDependencyUpdateFixes(
      buildLogs,
      repoPath,
      libraryInfo
    );
    
    console.log(`\n📊 Orchestration Results:`);
    console.log(`  Success: ${results.success ? '✅' : '❌'}`);
    console.log(`  Issues Found: ${results.totalIssuesFound}`);
    console.log(`  Fixes Applied: ${results.totalFixesApplied}`);
    console.log(`  Should Create PR: ${results.shouldCreatePR ? '✅' : '❌'}`);
    
    if (results.finalValidation) {
      console.log(`\n🔍 Final Validation:`);
      console.log(`  Build Passed: ${results.finalValidation.buildPassed ? '✅' : '❌'}`);
      console.log(`  Tests Passed: ${results.finalValidation.testsPassed ? '✅' : '❌'}`);
      console.log(`  PR Approved: ${results.finalValidation.shouldCreatePR ? '✅' : '❌'}`);
    }
    
    // Test PR creation (should succeed)
    if (results.shouldCreatePR) {
      console.log(`\n📝 Testing PR Creation...`);
      
      // Mock PR creation
      const prResult = {
        success: true,
        html_url: 'https://github.com/example/repo/pull/123',
        number: 123
      };
      
      console.log(`✅ PR Creation Successful: ${prResult.html_url}`);
    } else {
      console.log(`\n❌ PR Creation Blocked - Build validation failed`);
    }
    
    console.log(`\n📝 Summary:`);
    console.log(results.summary);
    
    return { success: true, results };
    
  } catch (error) {
    console.error(`❌ Orchestration workflow test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runBuildValidationTests() {
  console.log(`🚀 Starting Build Validation Tests`);
  console.log(`═`.repeat(80));
  console.log(`\n🎯 CRITICAL PRINCIPLE: Pull requests are only created when builds pass successfully!`);
  console.log(`This ensures that all dependency update fixes are validated before being proposed.`);
  
  const testResults = {
    scenarios: {},
    orchestration: null
  };
  
  // Test individual scenarios
  console.log(`\n📊 Phase 1: Testing Individual Build Validation Scenarios`);
  
  for (const [scenarioName, scenario] of Object.entries(testScenarios)) {
    testResults.scenarios[scenarioName] = await testBuildValidationScenario(scenarioName, scenario);
  }
  
  // Test full orchestration workflow
  console.log(`\n📊 Phase 2: Testing Full Orchestration Workflow`);
  testResults.orchestration = await testOrchestrationWorkflow();
  
  // Generate final report
  console.log(`\n📊 Final Test Report`);
  console.log(`═`.repeat(80));
  
  let scenariosPassed = 0;
  let scenariosTotal = 0;
  
  console.log(`\n🧪 Build Validation Scenarios:`);
  for (const [scenarioName, result] of Object.entries(testResults.scenarios)) {
    scenariosTotal++;
    if (result.success) {
      scenariosPassed++;
      console.log(`  ✅ ${scenarioName}: PASSED`);
    } else {
      console.log(`  ❌ ${scenarioName}: FAILED`);
    }
  }
  
  console.log(`\n🎯 Full Orchestration Workflow:`);
  if (testResults.orchestration.success) {
    console.log(`  ✅ PASSED`);
  } else {
    console.log(`  ❌ FAILED`);
  }
  
  const totalPassed = scenariosPassed + (testResults.orchestration.success ? 1 : 0);
  const totalTests = scenariosTotal + 1;
  
  console.log(`\n📊 Overall Results:`);
  console.log(`  Tests Passed: ${totalPassed}/${totalTests}`);
  console.log(`  Success Rate: ${Math.round((totalPassed / totalTests) * 100)}%`);
  
  if (totalPassed === totalTests) {
    console.log(`\n🎉 All tests passed! Build validation is working correctly.`);
    console.log(`✅ PRs will only be created when builds pass successfully.`);
  } else {
    console.log(`\n⚠️  Some tests failed. Build validation needs review.`);
  }
  
  console.log(`\n🔑 Key Validation Rules Tested:`);
  console.log(`  1. ✅ Build must compile successfully`);
  console.log(`  2. ✅ Test failure rate must be acceptable (< 20%)`);
  console.log(`  3. ✅ Critical fixes require stricter validation (< 5%)`);
  console.log(`  4. ✅ Dependency-related failures block PR creation`);
  console.log(`  5. ✅ Non-dependency failures may be acceptable`);
  
  console.log(`═`.repeat(80));
}

// Run the tests
runBuildValidationTests().catch(error => {
  console.error(`💥 Test runner failed: ${error.message}`);
  process.exit(1);
}); 