#!/usr/bin/env node

/**
 * Test script for the refined workflow
 * This script tests the key components of the new workflow
 */

import { PomXmlChangeDetector } from './src/services/pom-xml-change-detector.js';
import { RepositoryChecker } from './src/services/repository-checker.js';
import { ErrorHandler } from './src/services/error-handler.js';

// Mock context for testing
const mockContext = {
  log: {
    info: console.log,
    warn: console.warn,
    error: console.error
  },
  octokit: {
    rest: {
      pulls: {
        listFiles: async () => ({
          data: [
            {
              filename: 'pom.xml',
              status: 'modified',
              patch: `@@ -1,6 +1,6 @@
 <project>
   <dependencies>
-    <dependency>
-      <groupId>com.example</groupId>
-      <artifactId>old-library</artifactId>
-      <version>1.0.0</version>
-    </dependency>
+    <dependency>
+      <groupId>com.example</groupId>
+      <artifactId>new-library</artifactId>
+      <version>2.0.0</version>
+    </dependency>
   </dependencies>
 </project>`
            }
          ]
        })
      }
    }
  },
  payload: {
    repository: {
      full_name: 'test/repo',
      owner: { login: 'test' },
      name: 'repo',
      clone_url: 'https://github.com/test/repo.git'
    }
  }
};

// Mock pull request
const mockPullRequest = {
  number: 123,
  head: { sha: 'abc123' }
};

async function testPomXmlChangeDetector() {
  console.log('🧪 Testing PomXmlChangeDetector...');
  
  try {
    const detector = new PomXmlChangeDetector(mockContext);
    const changes = await detector.detectPomXmlChanges(mockPullRequest);
    
    console.log('✅ PomXmlChangeDetector test passed');
    console.log('📊 Changes detected:', changes.summary);
    console.log('📦 Dependency changes:', changes.dependencyChanges.length);
    console.log('🔧 Build changes:', changes.buildChanges.length);
    
    return changes;
  } catch (error) {
    console.error('❌ PomXmlChangeDetector test failed:', error.message);
    throw error;
  }
}

async function testErrorHandler() {
  console.log('🧪 Testing ErrorHandler...');
  
  try {
    const handler = new ErrorHandler(mockContext);
    
    // Test network error handling
    const networkError = new Error('Network timeout');
    networkError.name = 'NetworkError';
    
    const result = await handler.handleError(networkError, 'test_operation', {
      context: 'test_context'
    });
    
    console.log('✅ ErrorHandler test passed');
    console.log('📊 Error category:', result.category);
    console.log('🔄 Retry strategy:', result.retry ? 'retry' : 'no retry');
    console.log('🛡️ Recoverable:', result.recoverable);
    
    return result;
  } catch (error) {
    console.error('❌ ErrorHandler test failed:', error.message);
    throw error;
  }
}

async function testRepositoryChecker() {
  console.log('🧪 Testing RepositoryChecker...');
  
  try {
    const checker = new RepositoryChecker(mockContext);
    
    // Test pom.xml parsing (without actual checkout)
    const pomContent = `
<project>
  <groupId>com.example</groupId>
  <artifactId>test-project</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;
    
    const analysis = checker.parsePomXml(pomContent);
    
    console.log('✅ RepositoryChecker test passed');
    console.log('📊 Dependencies found:', analysis.dependencies.length);
    console.log('🔧 Plugins found:', analysis.plugins.length);
    console.log('⚙️ Properties found:', Object.keys(analysis.properties).length);
    
    return analysis;
  } catch (error) {
    console.error('❌ RepositoryChecker test failed:', error.message);
    throw error;
  }
}

async function runAllTests() {
  console.log('🚀 Starting workflow tests...\n');
  
  try {
    // Test PomXmlChangeDetector
    const pomChanges = await testPomXmlChangeDetector();
    console.log('');
    
    // Test ErrorHandler
    const errorResult = await testErrorHandler();
    console.log('');
    
    // Test RepositoryChecker
    const repoAnalysis = await testRepositoryChecker();
    console.log('');
    
    console.log('🎉 All tests passed!');
    console.log('\n📋 Test Summary:');
    console.log(`- PomXml changes: ${pomChanges.changes.length}`);
    console.log(`- Error handling: ${errorResult.category}`);
    console.log(`- Repository analysis: ${repoAnalysis.dependencies.length} dependencies`);
    
  } catch (error) {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testPomXmlChangeDetector, testErrorHandler, testRepositoryChecker, runAllTests };
