#!/usr/bin/env node

/**
 * Comprehensive Use Case Test Script
 * 
 * Tests all dependency update use cases with realistic scenarios
 */

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
  byam: {
    enabled: true,
    endpoint: 'http://localhost:3001'
  }
};

/**
 * Test scenarios for each use case
 */
const testScenarios = {
  deprecatedMethod: {
    name: 'Deprecated Method Replacement',
    buildLogs: `
[WARNING] /src/main/java/com/example/Service.java:25: warning: [deprecation] getInstance() in OldUtil has been deprecated
[WARNING] /src/main/java/com/example/Manager.java:42: warning: deprecated API used: StringUtils.isEmpty(String)
[ERROR] /src/main/java/com/example/Helper.java:15: error: cannot find symbol method getInstance()
    `,
    libraryInfo: {
      name: 'apache-commons-lang',
      oldVersion: '2.6',
      newVersion: '3.12.0'
    }
  },

  apiSignature: {
    name: 'API Signature Changes',
    buildLogs: `
[ERROR] /src/main/java/com/example/DataProcessor.java:30: error: method processData in class DataService cannot be applied to given types;
  required: java.lang.String,int
  found: java.lang.String
[ERROR] /src/main/java/com/example/UserService.java:18: error: no suitable method found for createUser(String)
    method UserService.createUser(String,UserRole) is not applicable
    `,
    libraryInfo: {
      name: 'spring-boot-starter',
      oldVersion: '2.7.0',
      newVersion: '3.0.0'
    }
  },

  dependencyScope: {
    name: 'Dependency Scope Issues',
    buildLogs: `
[ERROR] java.lang.ClassNotFoundException: javax.servlet.http.HttpServletRequest
[ERROR] Package org.junit.jupiter does not exist
[ERROR] /src/main/java/com/example/WebController.java:12: error: cannot find symbol class HttpServletRequest
    `,
    libraryInfo: {
      name: 'spring-boot-starter-web',
      oldVersion: '2.7.0',
      newVersion: '3.0.0'
    }
  },

  removedClasses: {
    name: 'Removed Classes',
    buildLogs: `
[ERROR] /src/main/java/com/example/LegacyService.java:8: error: cannot find symbol class OldUtil
[ERROR] /src/main/java/com/example/DataManager.java:15: error: package com.legacy.util does not exist
[ERROR] The import com.google.common.base.Objects cannot be resolved
    `,
    libraryInfo: {
      name: 'guava',
      oldVersion: '28.0',
      newVersion: '32.0.0'
    }
  },

  multiFileChanges: {
    name: 'Multi-File Synchronization',
    buildLogs: `
[ERROR] /src/main/java/com/example/UserService.java:25: error: method save in class UserDao cannot be applied to given types
[ERROR] /src/main/java/com/example/UserDao.java:18: error: incompatible types: Session cannot be converted to EntityManager
[ERROR] /src/main/java/com/example/UserController.java:30: error: method getUser in class UserService cannot be applied to given types
    `,
    libraryInfo: {
      name: 'hibernate-core',
      oldVersion: '5.6.0',
      newVersion: '6.2.0'
    }
  }
};

/**
 * Run individual use case test
 */
async function runUseCaseTest(useCaseType, scenario) {
  console.log(`\n🧪 Testing ${scenario.name}...`);
  console.log(`📋 Library: ${scenario.libraryInfo.name} ${scenario.libraryInfo.oldVersion} → ${scenario.libraryInfo.newVersion}`);
  
  const orchestrator = new UseCaseOrchestrator(mockContext, mockConfig);
  const repoPath = './test-repo'; // Mock repo path
  
  try {
    // Test detection
    console.log(`🔍 Testing detection for ${useCaseType}...`);
    const detectionResults = await orchestrator.detectAllIssues(scenario.buildLogs, repoPath);
    
    const issues = detectionResults[useCaseType] || [];
    console.log(`📊 Found ${issues.length} ${useCaseType} issues`);
    
    if (issues.length > 0) {
      console.log(`📋 Issues detected:`);
      issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.description || issue.type}`);
      });
      
      // Test fix generation
      console.log(`🔧 Testing fix generation...`);
      const fixResults = await orchestrator.generateCoordinatedFixes(
        detectionResults,
        scenario.libraryInfo,
        repoPath
      );
      
      const fixes = fixResults[useCaseType] || [];
      console.log(`⚡ Generated ${fixes.length} fixes`);
      
      if (fixes.length > 0) {
        console.log(`📋 Fixes generated:`);
        fixes.forEach((fix, index) => {
          console.log(`  ${index + 1}. ${fix.description}`);
          console.log(`     Confidence: ${fix.confidence || 'N/A'}`);
        });
      }
    }
    
    console.log(`✅ ${scenario.name} test completed successfully`);
    return { success: true, issues: issues.length, fixes: (fixResults[useCaseType] || []).length };
    
  } catch (error) {
    console.error(`❌ ${scenario.name} test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Run orchestration test
 */
async function runOrchestrationTest() {
  console.log(`\n🎯 Testing Full Orchestration...`);
  
  const orchestrator = new UseCaseOrchestrator(mockContext, mockConfig);
  const repoPath = './test-repo';
  
  // Combine all build logs for comprehensive test
  const combinedBuildLogs = Object.values(testScenarios)
    .map(scenario => scenario.buildLogs)
    .join('\n');
  
  const libraryInfo = {
    name: 'comprehensive-update',
    oldVersion: '1.0.0',
    newVersion: '2.0.0'
  };
  
  try {
    console.log(`🔍 Running comprehensive orchestration...`);
    const results = await orchestrator.orchestrateDependencyUpdateFixes(
      combinedBuildLogs,
      repoPath,
      libraryInfo
    );
    
    console.log(`📊 Orchestration Results:`);
    console.log(`  Total Issues Found: ${results.totalIssuesFound}`);
    console.log(`  Total Fixes Applied: ${results.totalFixesApplied}`);
    console.log(`  Success: ${results.success ? 'YES' : 'NO'}`);
    
    console.log(`\n📋 Use Case Breakdown:`);
    for (const [useCase, result] of Object.entries(results.useCaseResults)) {
      console.log(`  ${useCase}: ${result.appliedCount} fixes applied`);
    }
    
    if (results.finalValidation) {
      console.log(`\n🧪 Final Validation:`);
      console.log(`  Build Status: ${results.finalValidation.success ? 'PASSED' : 'FAILED'}`);
      console.log(`  Has Errors: ${results.finalValidation.hasErrors ? 'YES' : 'NO'}`);
      console.log(`  Has Warnings: ${results.finalValidation.hasWarnings ? 'YES' : 'NO'}`);
    }
    
    console.log(`\n📝 Summary:`);
    console.log(results.summary);
    
    console.log(`✅ Orchestration test completed successfully`);
    return { success: true, results };
    
  } catch (error) {
    console.error(`❌ Orchestration test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test pull request creation
 */
async function testPullRequestCreation() {
  console.log(`\n📝 Testing Pull Request Creation...`);
  
  const orchestrator = new UseCaseOrchestrator(mockContext, mockConfig);
  
  // Mock orchestration results
  const mockResults = {
    totalIssuesFound: 15,
    totalFixesApplied: 12,
    success: true,
    useCaseResults: {
      deprecatedMethod: { appliedCount: 3, success: true },
      apiSignature: { appliedCount: 4, success: true },
      dependencyScope: { appliedCount: 2, success: true },
      removedClasses: { appliedCount: 2, success: true },
      multiFileChanges: { appliedCount: 1, success: true }
    },
    finalValidation: {
      success: true,
      hasErrors: false,
      hasWarnings: true,
      testResults: { totalTests: 25, passedTests: 24, failedTests: 1, skippedTests: 0 }
    }
  };
  
  const libraryInfo = {
    name: 'test-library',
    oldVersion: '1.0.0',
    newVersion: '2.0.0'
  };
  
  try {
    const prBody = orchestrator.buildPullRequestBody(mockResults, libraryInfo);
    
    console.log(`📋 Generated PR Body:`);
    console.log('─'.repeat(80));
    console.log(prBody);
    console.log('─'.repeat(80));
    
    console.log(`✅ Pull request creation test completed successfully`);
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Pull request creation test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(`🚀 Starting Comprehensive Use Case Testing...`);
  console.log(`═`.repeat(80));
  
  const testResults = {
    individual: {},
    orchestration: null,
    pullRequest: null
  };
  
  // Run individual use case tests
  console.log(`\n📊 Phase 1: Individual Use Case Testing`);
  for (const [useCaseType, scenario] of Object.entries(testScenarios)) {
    testResults.individual[useCaseType] = await runUseCaseTest(useCaseType, scenario);
  }
  
  // Run orchestration test
  console.log(`\n📊 Phase 2: Orchestration Testing`);
  testResults.orchestration = await runOrchestrationTest();
  
  // Run PR creation test
  console.log(`\n📊 Phase 3: Pull Request Creation Testing`);
  testResults.pullRequest = await testPullRequestCreation();
  
  // Generate final report
  console.log(`\n📊 Final Test Report`);
  console.log(`═`.repeat(80));
  
  console.log(`\n🧪 Individual Use Case Tests:`);
  let individualPassed = 0;
  let individualTotal = 0;
  
  for (const [useCaseType, result] of Object.entries(testResults.individual)) {
    individualTotal++;
    if (result.success) {
      individualPassed++;
      console.log(`  ✅ ${useCaseType}: PASSED (${result.issues} issues, ${result.fixes} fixes)`);
    } else {
      console.log(`  ❌ ${useCaseType}: FAILED (${result.error})`);
    }
  }
  
  console.log(`\n🎯 Orchestration Test:`);
  if (testResults.orchestration.success) {
    console.log(`  ✅ PASSED`);
  } else {
    console.log(`  ❌ FAILED (${testResults.orchestration.error})`);
  }
  
  console.log(`\n📝 Pull Request Creation Test:`);
  if (testResults.pullRequest.success) {
    console.log(`  ✅ PASSED`);
  } else {
    console.log(`  ❌ FAILED (${testResults.pullRequest.error})`);
  }
  
  const totalPassed = individualPassed + 
    (testResults.orchestration.success ? 1 : 0) + 
    (testResults.pullRequest.success ? 1 : 0);
  const totalTests = individualTotal + 2;
  
  console.log(`\n📊 Overall Results:`);
  console.log(`  Tests Passed: ${totalPassed}/${totalTests}`);
  console.log(`  Success Rate: ${Math.round((totalPassed / totalTests) * 100)}%`);
  
  if (totalPassed === totalTests) {
    console.log(`\n🎉 All tests passed! The use case system is ready for production.`);
  } else {
    console.log(`\n⚠️  Some tests failed. Please review the errors above.`);
  }
  
  console.log(`═`.repeat(80));
}

// Run the tests
runAllTests().catch(error => {
  console.error(`💥 Test runner failed: ${error.message}`);
  process.exit(1);
}); 