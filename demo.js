#!/usr/bin/env node

/**
 * Java Breaking Change Detector Demo
 * 
 * This demo shows how the Java-focused breaking change detection works
 * with comprehensive build validation and CI/CD integration for Maven and Gradle projects.
 */

import { BreakingChangeDetector } from './src/services/breaking-change-detector.js';
import { BranchCreator } from './src/services/branch-creator.js';
import { CICDIntegration } from './src/services/ci-cd-integration.js';

// Mock Probot app for demo
const mockApp = {
  log: {
    info: (msg) => console.log(`ℹ️  ${msg}`),
    error: (msg) => console.log(`❌ ${msg}`),
    warn: (msg) => console.log(`⚠️  ${msg}`),
    debug: (msg) => console.log(`🔍 ${msg}`)
  }
};

// Mock context for demo
const mockContext = {
  payload: {
    repository: {
      owner: { login: 'demo-user' },
      name: 'demo-java-repo',
      full_name: 'demo-user/demo-java-repo'
    }
  },
  octokit: {
    rest: {
      repos: {
        getContent: async ({ path }) => {
          // Mock repository content detection
          if (path === 'pom.xml') {
            return { data: { content: 'mock-pom-xml' } };
          }
          if (path === 'build.gradle') {
            return { data: { content: 'mock-build-gradle' } };
          }
          if (path === '.github/workflows') {
            return { data: { content: 'mock-workflows' } };
          }
          throw new Error('File not found');
        }
      }
    }
  }
};

/**
 * Demo the Java breaking change detection workflow with CI/CD integration
 */
async function runDemo() {
  console.log('🚀 Java Breaking Change Detector Demo with CI/CD Integration\n');

  try {
    // Initialize services
    console.log('☕ Initializing Java services...');
    const breakingChangeDetector = new BreakingChangeDetector(mockApp);
    const branchCreator = new BranchCreator(mockApp);
    const cicdIntegration = new CICDIntegration(mockApp);

    // Demo 1: Detect Java build tool
    console.log('\n🔍 Demo 1: Java Build Tool Detection');
    const buildTool = await breakingChangeDetector.detectJavaBuildTool(mockContext);
    console.log(`✅ Detected Java build tool: ${buildTool}`);

    // Demo 2: Check for Java dependency updates
    console.log('\n📦 Demo 2: Java Dependency Update Detection');
    const mockCommits = [
      { modified: ['pom.xml'], added: [] },
      { modified: [], added: ['new-file.java'] }
    ];
    const isDependencyUpdate = await breakingChangeDetector.isDependencyUpdate(mockCommits);
    console.log(`✅ Java dependency update detected: ${isDependencyUpdate}`);

    // Demo 3: Build validation simulation
    console.log('\n🔧 Demo 3: Build Validation');
    const mockBuildValidation = {
      success: false,
      buildFailures: [
        {
          type: 'compile_failure',
          message: '[ERROR] cannot find symbol class com.example.OldClass',
          severity: 'high'
        },
        {
          type: 'compile_failure',
          message: '[ERROR] method doSomething(String) cannot be applied',
          severity: 'medium'
        },
        {
          type: 'test_failure',
          message: 'Tests run: 10, Failures: 2',
          severity: 'medium'
        }
      ],
      buildTool: 'maven',
      timestamp: new Date().toISOString()
    };
    console.log(`✅ Build validation completed: ${mockBuildValidation.buildFailures.length} failures found`);

    // Demo 4: Breaking change detection (simulated)
    console.log('\n⚠️ Demo 4: Java Breaking Change Detection');
    const breakingChanges = {
      hasBreakingChanges: true,
      changes: [
        {
          type: 'removed_class_or_package',
          description: 'Class com.example.OldClass not found',
          severity: 'high'
        },
        {
          type: 'api_signature_change',
          description: 'Method doSomething signature changed',
          severity: 'medium'
        },
        {
          type: 'deprecated_api',
          description: 'oldMethod is deprecated',
          severity: 'low'
        }
      ],
      buildValidation: mockBuildValidation,
      buildTool: 'maven',
      projectType: 'java',
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Found ${breakingChanges.changes.length} Java breaking changes:`);
    breakingChanges.changes.forEach((change, index) => {
      console.log(`  ${index + 1}. ${change.type}: ${change.description} (${change.severity})`);
    });

    console.log(`\n📋 Build Failures:`);
    breakingChanges.buildValidation.buildFailures.forEach((failure, index) => {
      console.log(`  ${index + 1}. ${failure.type}: ${failure.message} (${failure.severity})`);
    });

    // Demo 5: Branch creation (simulated)
    console.log('\n🌿 Demo 5: Branch Creation');
    const branchResult = await branchCreator.createFixBranch(mockContext, breakingChanges);
    
    if (branchResult.success) {
      console.log(`✅ Branch created: ${branchResult.branchName}`);
      console.log(`📁 Files modified: ${branchResult.filesModified.length}`);
      console.log(`🔧 Changes applied: ${branchResult.changesApplied}`);
    } else {
      console.log(`❌ Branch creation failed: ${branchResult.error}`);
    }

    // Demo 6: CI/CD Integration
    console.log('\n🔗 Demo 6: CI/CD Integration');
    const cicdResult = await cicdIntegration.integrateWithCICD(mockContext, breakingChanges);
    
    if (cicdResult.success) {
      console.log(`✅ CI/CD integration completed: ${cicdResult.platform}`);
      console.log(`📋 Workflows created: ${cicdResult.workflowResult?.workflowFile || 'None'}`);
      console.log(`🔧 Detection setup: ${cicdResult.detectionResult?.actionFile || 'None'}`);
      console.log(`📢 Notifications: ${cicdResult.notificationResult?.notificationFile || 'None'}`);
    } else {
      console.log(`❌ CI/CD integration failed: ${cicdResult.error}`);
    }

    // Demo 7: CI/CD Platform Detection
    console.log('\n🔍 Demo 7: CI/CD Platform Detection');
    const platform = await cicdIntegration.detectCICDPlatform(mockContext);
    console.log(`✅ Detected CI/CD platform: ${platform}`);

    // Demo 8: Workflow Event Handling (simulated)
    console.log('\n🔄 Demo 8: Workflow Event Handling');
    const mockWorkflowContext = {
      payload: {
        workflow_run: {
          id: 12345,
          name: 'Java Breaking Change Detection',
          conclusion: 'failure',
          actor: { login: 'demo-user' },
          head_branch: 'main',
          html_url: 'https://github.com/demo-user/demo-java-repo/actions/runs/12345'
        },
        repository: {
          owner: { login: 'demo-user' },
          name: 'demo-java-repo'
        }
      },
      octokit: mockContext.octokit
    };
    
    const workflowResult = await cicdIntegration.handleWorkflowEvent(mockWorkflowContext);
    console.log(`✅ Workflow event processed: ${workflowResult.action}`);

    // Demo 9: Show generated branch name
    console.log('\n🏷️ Demo 9: Branch Naming');
    const branchName = branchCreator.generateBranchName(breakingChanges);
    console.log(`✅ Generated branch name: ${branchName}`);

    // Demo 10: Show commit message
    console.log('\n💾 Demo 10: Commit Message Generation');
    const commitMessage = branchCreator.generateCommitMessage(breakingChanges);
    console.log('✅ Generated commit message:');
    console.log(commitMessage);

    // Demo 11: Build validation commands
    console.log('\n🔧 Demo 11: Build Validation Commands');
    const buildCommands = {
      maven: 'mvn clean compile test',
      gradle: './gradlew clean build'
    };
    console.log(`✅ Maven build command: ${buildCommands.maven}`);
    console.log(`✅ Gradle build command: ${buildCommands.gradle}`);

    // Demo 12: CI/CD Commands
    console.log('\n🔗 Demo 12: CI/CD Commands');
    console.log('✅ Manual breaking change check: /check-breaking-changes');
    console.log('✅ CI/CD setup: /setup-cicd');
    console.log('✅ Workflow monitoring: Automatic on push/PR');

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Java build tool detection: ✅');
    console.log('- Java dependency update detection: ✅');
    console.log('- Build validation: ✅');
    console.log('- Breaking change detection: ✅');
    console.log('- Branch creation: ✅');
    console.log('- Fix application: ✅');
    console.log('- CI/CD integration: ✅');
    console.log('- GitHub Actions workflows: ✅');
    console.log('- Workflow event handling: ✅');
    console.log('- Platform detection: ✅');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  }
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Java Breaking Change Detector with CI/CD Integration - Usage

This demo shows the Java-focused breaking change detection system with build validation
and comprehensive CI/CD integration.

Features Demonstrated:
- Java build tool detection (Maven/Gradle)
- Java dependency update detection
- Comprehensive build validation
- Breaking change analysis
- Automatic branch creation
- Fix application
- CI/CD integration (GitHub Actions, Jenkins, GitLab CI)
- Workflow event handling
- Platform detection

Build Validation Process:
1. Clean build
2. Compile
3. Run tests
4. Analyze dependencies
5. Detect build failures

CI/CD Integration Features:
- Automatic workflow creation
- Breaking change detection in CI/CD
- Notification workflows
- Issue creation for CI/CD failures
- Platform-specific handlers

To run the demo:
  node demo.js

To run the actual application:
  npm start

For more information, see README.md
`);
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
  } else {
    runDemo();
  }
} 