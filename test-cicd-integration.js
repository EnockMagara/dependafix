#!/usr/bin/env node

/**
 * CI/CD Integration Test
 * 
 * Tests the CI/CD integration functionality of the Java Breaking Change Detector
 */

import { CICDIntegration } from './src/services/ci-cd-integration.js';

// Mock Probot app
const mockApp = {
  log: {
    info: (msg) => console.log(`ℹ️  ${msg}`),
    error: (msg) => console.log(`❌ ${msg}`),
    warn: (msg) => console.log(`⚠️  ${msg}`),
    debug: (msg) => console.log(`🔍 ${msg}`)
  }
};

// Mock context
const mockContext = {
  payload: {
    repository: {
      owner: { login: 'test-user' },
      name: 'test-java-repo',
      full_name: 'test-user/test-java-repo'
    }
  },
  octokit: {
    rest: {
      repos: {
        getContent: async ({ path }) => {
          // Mock repository content detection
          if (path === '.github/workflows') {
            return { data: { content: 'mock-workflows' } };
          }
          if (path === 'Jenkinsfile') {
            return { data: { content: 'mock-jenkins' } };
          }
          if (path === '.gitlab-ci.yml') {
            return { data: { content: 'mock-gitlab' } };
          }
          throw new Error('File not found');
        },
        createOrUpdateFileContents: async (params) => {
          console.log(`📝 Would create/update file: ${params.path}`);
          return { data: { content: { sha: 'mock-sha' } } };
        }
      },
      actions: {
        downloadWorkflowRunLogs: async (params) => {
          console.log(`📥 Would download workflow logs for run: ${params.run_id}`);
          return { data: 'mock-workflow-logs' };
        }
      }
    }
  }
};

/**
 * Test CI/CD integration functionality
 */
async function testCICDIntegration() {
  console.log('🔗 Testing CI/CD Integration\n');

  try {
    // Initialize CI/CD integration
    const cicdIntegration = new CICDIntegration(mockApp);

    // Test 1: Platform Detection
    console.log('🔍 Test 1: CI/CD Platform Detection');
    const platform = await cicdIntegration.detectCICDPlatform(mockContext);
    console.log(`✅ Detected platform: ${platform}\n`);

    // Test 2: CI/CD Integration
    console.log('🔗 Test 2: CI/CD Integration');
    const mockBreakingChanges = {
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
        }
      ],
      buildTool: 'maven',
      projectType: 'java'
    };

    const integrationResult = await cicdIntegration.integrateWithCICD(mockContext, mockBreakingChanges);
    console.log(`✅ Integration result: ${JSON.stringify(integrationResult, null, 2)}\n`);

    // Test 3: Workflow Event Handling
    console.log('🔄 Test 3: Workflow Event Handling');
    const mockWorkflowContext = {
      payload: {
        workflow_run: {
          id: 12345,
          name: 'Java Breaking Change Detection',
          conclusion: 'failure',
          actor: { login: 'test-user' },
          head_branch: 'main',
          html_url: 'https://github.com/test-user/test-java-repo/actions/runs/12345'
        },
        repository: {
          owner: { login: 'test-user' },
          name: 'test-java-repo'
        }
      },
      octokit: mockContext.octokit
    };

    const workflowResult = await cicdIntegration.handleWorkflowEvent(mockWorkflowContext);
    console.log(`✅ Workflow result: ${JSON.stringify(workflowResult, null, 2)}\n`);

    // Test 4: Breaking Change Analysis
    console.log('📊 Test 4: Breaking Change Analysis');
    const mockLogs = `
[ERROR] cannot find symbol class com.example.OldClass
[ERROR] method doSomething(String) cannot be applied
[ERROR] package com.example.old does not exist
Tests run: 10, Failures: 2
BUILD FAILED
    `;

    const breakingChanges = cicdIntegration.parseBreakingChangesFromLogs(mockLogs);
    console.log(`✅ Found ${breakingChanges.length} breaking changes:`);
    breakingChanges.forEach((change, index) => {
      console.log(`  ${index + 1}. ${change.type}: ${change.description} (${change.severity})`);
    });

    console.log('\n🎉 CI/CD Integration Test Completed Successfully!');
    console.log('\n📋 Test Summary:');
    console.log('- Platform detection: ✅');
    console.log('- CI/CD integration: ✅');
    console.log('- Workflow event handling: ✅');
    console.log('- Breaking change analysis: ✅');

  } catch (error) {
    console.error('\n❌ CI/CD Integration Test Failed:', error.message);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCICDIntegration();
} 