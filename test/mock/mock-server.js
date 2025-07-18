#!/usr/bin/env node

/**
 * Mock Server for Dependafix Testing
 * 
 * Provides comprehensive mocking for:
 * - GitHub webhooks and API
 * - LLM (Byam) responses
 * - Build processes
 * - Git operations
 */

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MockServer {
  constructor(port = 3001) {
    this.app = express();
    this.server = null;
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`🌐 ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // GitHub API Mock Routes
    this.setupGitHubMockRoutes();

    // LLM (Byam) Mock Routes
    this.setupByamMockRoutes();

    // Build Process Mock Routes
    this.setupBuildMockRoutes();

    // Test Data Routes
    this.setupTestDataRoutes();
  }

  setupGitHubMockRoutes() {
    // Mock GitHub repository API
    this.app.get('/api/repos/:owner/:repo', (req, res) => {
      const { owner, repo } = req.params;
      res.json({
        id: 12345,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner },
        clone_url: `https://github.com/${owner}/${repo}.git`,
        default_branch: 'main',
        language: 'Java',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: new Date().toISOString()
      });
    });

    // Mock GitHub pull request creation
    this.app.post('/api/repos/:owner/:repo/pulls', (req, res) => {
      const { owner, repo } = req.params;
      const { title, body, head, base } = req.body;
      
      const prNumber = Math.floor(Math.random() * 1000) + 1;
      
      res.status(201).json({
        id: prNumber * 100,
        number: prNumber,
        title,
        body,
        head: { ref: head },
        base: { ref: base },
        html_url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        state: 'open',
        created_at: new Date().toISOString(),
        user: { login: 'dependafix[bot]' }
      });
    });

    // Mock GitHub file contents
    this.app.get('/api/repos/:owner/:repo/contents/:path', (req, res) => {
      const { owner, repo, path } = req.params;
      
      let content = '';
      let encoding = 'base64';
      
      if (path === 'pom.xml') {
        content = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0.0</version>
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-core</artifactId>
            <version>5.3.0</version>
        </dependency>
    </dependencies>
</project>`).toString('base64');
      } else if (path === 'build.gradle') {
        content = Buffer.from(`plugins {
    id 'java'
}

dependencies {
    implementation 'org.springframework:spring-core:5.3.0'
    testImplementation 'junit:junit:4.13.2'
}`).toString('base64');
      }
      
      res.json({
        name: path,
        path,
        content,
        encoding,
        size: content.length,
        sha: 'abc123def456'
      });
    });
  }

  setupByamMockRoutes() {
    // Mock Byam LLM fix generation
    this.app.post('/api/byam/generate-fixes', (req, res) => {
      const { type, context } = req.body;
      
      console.log(`🤖 Byam Mock: Generating fixes for ${type}`);
      
      // Simulate processing delay
      setTimeout(() => {
        const mockFixes = this.generateMockFixes(type, context);
        res.json({
          success: true,
          fixes: mockFixes,
          confidence: 0.85,
          processingTime: Math.random() * 2000 + 500
        });
      }, 1000);
    });

    // Mock Byam health check
    this.app.get('/api/byam/health', (req, res) => {
      res.json({
        status: 'healthy',
        model: 'mock-llm-v1',
        version: '1.0.0',
        capabilities: [
          'deprecated_method_replacement',
          'api_signature_change',
          'dependency_scope_fix',
          'removed_class_fix',
          'multi_file_changes'
        ]
      });
    });
  }

  setupBuildMockRoutes() {
    // Mock build execution
    this.app.post('/api/build/execute', (req, res) => {
      const { buildTool, command, repoPath } = req.body;
      
      console.log(`🔨 Build Mock: Executing ${buildTool} ${command}`);
      
      // Simulate build process
      setTimeout(() => {
        const buildResult = this.generateMockBuildResult(buildTool, command);
        res.json(buildResult);
      }, 2000);
    });

    // Mock dependency check
    this.app.post('/api/build/check-dependencies', (req, res) => {
      const { buildTool, repoPath } = req.body;
      
      console.log(`📦 Dependency Mock: Checking ${buildTool} dependencies`);
      
      setTimeout(() => {
        const dependencyResult = this.generateMockDependencyResult(buildTool);
        res.json(dependencyResult);
      }, 1500);
    });
  }

  setupTestDataRoutes() {
    // Get test scenarios
    this.app.get('/api/test/scenarios', (req, res) => {
      res.json({
        scenarios: [
          'deprecated_method',
          'api_signature_change',
          'dependency_scope',
          'removed_classes',
          'multi_file_changes'
        ]
      });
    });

    // Get mock build logs
    this.app.get('/api/test/build-logs/:scenario', (req, res) => {
      const { scenario } = req.params;
      const buildLogs = this.getMockBuildLogs(scenario);
      res.json({ scenario, buildLogs });
    });
  }

  generateMockFixes(type, context) {
    const fixes = [];
    
    switch (type) {
      case 'deprecated_method_replacement':
        fixes.push({
          type: 'deprecated_method_fix',
          description: 'Replace deprecated getInstance() method',
          file: 'src/main/java/com/example/Service.java',
          lineNumber: 25,
          oldCode: 'OldUtil.getInstance().processData(data);',
          newCode: 'OldUtil.getInstance2().processData(data);',
          explanation: 'Updated to use new non-deprecated method',
          confidence: 0.9
        });
        break;
        
      case 'api_signature_change':
        fixes.push({
          type: 'api_signature_fix',
          description: 'Adapt to new API signature',
          file: 'src/main/java/com/example/UserService.java',
          lineNumber: 42,
          oldCode: 'service.processData("test");',
          newCode: 'service.processData("test", 1);',
          explanation: 'Added required parameter to match new API',
          confidence: 0.85
        });
        break;
        
      case 'dependency_scope_fix':
        fixes.push({
          type: 'dependency_scope_fix',
          description: 'Fix dependency scope',
          buildTool: 'maven',
          dependencyInfo: {
            groupId: 'javax.servlet',
            artifactId: 'javax.servlet-api'
          },
          newScope: 'provided',
          explanation: 'Servlet API should be provided by container',
          confidence: 0.95
        });
        break;
        
      default:
        fixes.push({
          type: 'generic_fix',
          description: 'Generic fix for dependency issue',
          confidence: 0.7
        });
    }
    
    return fixes;
  }

  generateMockBuildResult(buildTool, command) {
    const isSuccess = Math.random() > 0.3; // 70% success rate
    
    if (isSuccess) {
      return {
        success: true,
        exitCode: 0,
        logs: `[INFO] BUILD SUCCESS\n[INFO] Total time: 2.345 s\n[INFO] Tests run: 25, Failures: 0, Errors: 0, Skipped: 0`,
        duration: Math.random() * 30000 + 10000
      };
    } else {
      return {
        success: false,
        exitCode: 1,
        logs: `[ERROR] BUILD FAILED\n[ERROR] /src/main/java/Service.java:25: cannot find symbol method getInstance()`,
        duration: Math.random() * 15000 + 5000
      };
    }
  }

  generateMockDependencyResult(buildTool) {
    const outdatedDependencies = [
      {
        groupId: 'org.springframework',
        artifactId: 'spring-core',
        currentVersion: '5.3.0',
        latestVersion: '6.0.0',
        type: 'major'
      },
      {
        groupId: 'junit',
        artifactId: 'junit',
        currentVersion: '4.13.2',
        latestVersion: '5.9.0',
        type: 'major'
      }
    ];

    return {
      success: true,
      buildTool,
      outdatedDependencies,
      totalDependencies: 15,
      upToDateDependencies: 13,
      report: `Found ${outdatedDependencies.length} outdated dependencies`
    };
  }

  getMockBuildLogs(scenario) {
    const logs = {
      deprecated_method: `[WARNING] /src/main/java/Service.java:25: warning: [deprecation] getInstance() in OldUtil has been deprecated`,
      api_signature_change: `[ERROR] /src/main/java/UserService.java:42: error: method processData in class DataService cannot be applied to given types`,
      dependency_scope: `[ERROR] java.lang.ClassNotFoundException: javax.servlet.http.HttpServletRequest`,
      removed_classes: `[ERROR] /src/main/java/LegacyService.java:8: error: cannot find symbol class OldUtil`,
      multi_file_changes: `[ERROR] /src/main/java/UserService.java:25: error: method save in class UserDao cannot be applied to given types`
    };

    return logs[scenario] || '[INFO] BUILD SUCCESS';
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🚀 Mock Server running on port ${this.port}`);
          console.log(`📋 Available endpoints:`);
          console.log(`   Health: http://localhost:${this.port}/health`);
          console.log(`   GitHub API: http://localhost:${this.port}/api/repos/*`);
          console.log(`   Byam LLM: http://localhost:${this.port}/api/byam/*`);
          console.log(`   Build: http://localhost:${this.port}/api/build/*`);
          console.log(`   Test Data: http://localhost:${this.port}/api/test/*`);
          resolve();
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Mock Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new MockServer();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down mock server...');
    await server.stop();
    process.exit(0);
  });
  
  server.start().catch(console.error);
}

export { MockServer }; 