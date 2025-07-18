import { expect } from 'chai';
import sinon from 'sinon';
import supertest from 'supertest';
import { MockServer } from '../mock/mock-server.js';
import { WebhookSimulator } from '../mock/webhook-simulator.js';
import { DependafixService } from '../../src/services/dependafix/dependafix-service.js';

describe('Webhook Integration Tests', () => {
  let mockServer;
  let webhookSimulator;
  let dependafixService;
  let mockContext;

  before(async () => {
    // Start mock server
    mockServer = new MockServer(3002);
    await mockServer.start();
    
    // Initialize webhook simulator
    webhookSimulator = new WebhookSimulator('http://localhost:3002');
    
    // Setup mock context
    mockContext = {
      log: {
        info: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub()
      }
    };
    
    // Initialize Dependafix service with mocked dependencies
    dependafixService = new DependafixService(mockContext, {
      byam: {
        endpoint: 'http://localhost:3002/api/byam'
      },
      github: {
        endpoint: 'http://localhost:3002/api'
      }
    });
  });

  after(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Pull Request Webhook Integration', () => {
    it('should process pull request opened event successfully', async () => {
      // Mock the build process to simulate successful validation
      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-123',
        fixPullRequest: {
          number: 456,
          html_url: 'https://github.com/example/test-repo/pull/456'
        },
        issuesFixed: 3,
        appliedFixes: 5,
        buildValidated: true
      });

      const payload = {
        action: 'opened',
        pull_request: {
          id: 123456,
          number: 123,
          title: 'Bump spring-core from 5.3.0 to 6.0.0',
          body: 'Updates spring-core dependency',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.true;
      expect(result.buildValidated).to.be.true;
      expect(result.appliedFixes).to.equal(5);
      expect(dependafixService.processDependencyUpdate.calledOnce).to.be.true;
    });

    it('should skip non-dependency pull requests', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          id: 123456,
          number: 123,
          title: 'Add new feature',
          body: 'This is a regular feature PR',
          user: { login: 'developer' }
        },
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.true;
      expect(result.skipped).to.be.true;
      expect(result.reason).to.include('Not a dependency update');
    });

    it('should handle build validation failure', async () => {
      // Mock the build process to simulate validation failure
      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: false,
        error: 'Build validation failed - fixes did not resolve all issues',
        processingId: 'test-123',
        orchestrationResults: {
          totalIssuesFound: 5,
          totalFixesApplied: 3,
          shouldCreatePR: false,
          finalValidation: {
            buildPassed: false,
            testsPassed: false,
            shouldCreatePR: false
          }
        }
      });

      const payload = {
        action: 'opened',
        pull_request: {
          id: 123456,
          number: 123,
          title: 'Bump hibernate-core from 5.6.0 to 6.2.0',
          body: 'Updates hibernate-core dependency',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Build validation failed');
      expect(result.orchestrationResults.shouldCreatePR).to.be.false;
    });
  });

  describe('Push Webhook Integration', () => {
    it('should process push event with dependency changes', async () => {
      // Mock successful processing
      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-456',
        fixPullRequest: {
          number: 789,
          html_url: 'https://github.com/example/test-repo/pull/789'
        },
        buildValidated: true
      });

      const payload = {
        ref: 'refs/heads/main',
        commits: [
          {
            id: 'abc123',
            message: 'Update dependencies',
            modified: ['pom.xml', 'src/main/java/Service.java']
          }
        ],
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('push', payload);

      expect(result.success).to.be.true;
      expect(result.buildValidated).to.be.true;
    });

    it('should skip push events without dependency changes', async () => {
      const payload = {
        ref: 'refs/heads/main',
        commits: [
          {
            id: 'abc123',
            message: 'Update README',
            modified: ['README.md', 'docs/guide.md']
          }
        ],
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('push', payload);

      expect(result.success).to.be.true;
      expect(result.skipped).to.be.true;
      expect(result.reason).to.include('No dependency changes');
    });
  });

  describe('Build Validation Integration', () => {
    it('should validate builds before creating pull requests', async () => {
      // Mock repository operations
      sinon.stub(dependafixService.repositoryManager, 'checkoutRepository').resolves('./test-repo');
      sinon.stub(dependafixService.buildRunner, 'detectBuildTool').resolves('maven');
      sinon.stub(dependafixService.buildRunner, 'runBuild').resolves({
        success: false,
        logs: '[ERROR] cannot find symbol method getInstance()'
      });

      // Mock log analysis
      sinon.stub(dependafixService.logAnalyzer, 'analyzeBuildLogs').resolves({
        issues: [
          { type: 'deprecated_method', method: 'getInstance()' }
        ],
        dependencyInfo: {
          name: 'apache-commons-lang',
          oldVersion: '2.6',
          newVersion: '3.12.0'
        }
      });

      // Mock orchestration with successful validation
      const mockOrchestrationResults = {
        success: true,
        totalIssuesFound: 1,
        totalFixesApplied: 1,
        shouldCreatePR: true,
        finalValidation: {
          buildPassed: true,
          testsPassed: true,
          shouldCreatePR: true
        }
      };

      // Mock the entire orchestration process
      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-validation',
        buildValidated: true,
        orchestrationResults: mockOrchestrationResults
      });

      const payload = {
        action: 'opened',
        pull_request: {
          id: 123456,
          number: 123,
          title: 'Bump apache-commons-lang from 2.6 to 3.12.0',
          body: 'Updates apache-commons-lang dependency',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.true;
      expect(result.buildValidated).to.be.true;
      expect(result.orchestrationResults.shouldCreatePR).to.be.true;
    });

    it('should block PR creation when build validation fails', async () => {
      // Mock orchestration with failed validation
      const mockOrchestrationResults = {
        success: false,
        totalIssuesFound: 5,
        totalFixesApplied: 3,
        shouldCreatePR: false,
        finalValidation: {
          buildPassed: false,
          testsPassed: false,
          shouldCreatePR: false,
          errors: ['Build compilation failed']
        }
      };

      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: false,
        error: 'Build validation failed - fixes did not resolve all issues',
        processingId: 'test-validation-fail',
        orchestrationResults: mockOrchestrationResults
      });

      const payload = {
        action: 'opened',
        pull_request: {
          id: 123456,
          number: 123,
          title: 'Bump spring-boot from 2.7.0 to 3.0.0',
          body: 'Major version update',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          id: 12345,
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Build validation failed');
      expect(result.orchestrationResults.shouldCreatePR).to.be.false;
    });
  });

  describe('Use Case Integration', () => {
    it('should handle deprecated method replacement scenario', async () => {
      const mockOrchestrationResults = {
        success: true,
        totalIssuesFound: 2,
        totalFixesApplied: 2,
        shouldCreatePR: true,
        useCaseResults: {
          deprecatedMethod: { appliedCount: 2, success: true }
        },
        finalValidation: {
          buildPassed: true,
          testsPassed: true,
          shouldCreatePR: true
        }
      };

      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-deprecated',
        buildValidated: true,
        orchestrationResults: mockOrchestrationResults
      });

      const payload = {
        action: 'opened',
        pull_request: {
          title: 'Bump commons-lang from 2.6 to 3.12.0',
          body: 'Updates commons-lang with deprecated method fixes',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.true;
      expect(result.orchestrationResults.useCaseResults.deprecatedMethod.appliedCount).to.equal(2);
    });

    it('should handle multi-file changes scenario', async () => {
      const mockOrchestrationResults = {
        success: true,
        totalIssuesFound: 3,
        totalFixesApplied: 3,
        shouldCreatePR: true,
        useCaseResults: {
          multiFileChanges: { appliedCount: 3, success: true }
        },
        finalValidation: {
          buildPassed: true,
          testsPassed: true,
          shouldCreatePR: true
        }
      };

      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-multifile',
        buildValidated: true,
        orchestrationResults: mockOrchestrationResults
      });

      const payload = {
        action: 'opened',
        pull_request: {
          title: 'Bump hibernate-core from 5.6.0 to 6.2.0',
          body: 'Major Hibernate update affecting multiple files',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.true;
      expect(result.orchestrationResults.useCaseResults.multiFileChanges.appliedCount).to.equal(3);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle repository checkout failures gracefully', async () => {
      sinon.stub(dependafixService, 'processDependencyUpdate').rejects(
        new Error('Repository checkout failed')
      );

      const payload = {
        action: 'opened',
        pull_request: {
          title: 'Bump dependency',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Repository checkout failed');
    });

    it('should handle unsupported event types', async () => {
      const payload = { repository: { name: 'test-repo' } };
      
      const result = await dependafixService.processWebhookEvent('unsupported_event', payload);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Unsupported event type');
    });
  });

  describe('Performance Integration', () => {
    it('should complete processing within reasonable time limits', async () => {
      const startTime = Date.now();

      // Mock fast processing
      sinon.stub(dependafixService, 'processDependencyUpdate').resolves({
        success: true,
        processingId: 'test-perf',
        buildValidated: true
      });

      const payload = {
        action: 'opened',
        pull_request: {
          title: 'Bump dependency',
          user: { login: 'dependabot[bot]' }
        },
        repository: {
          name: 'test-repo',
          full_name: 'example/test-repo',
          owner: { login: 'example' }
        }
      };

      const result = await dependafixService.processWebhookEvent('pull_request', payload);
      const processingTime = Date.now() - startTime;

      expect(result.success).to.be.true;
      expect(processingTime).to.be.lessThan(5000); // Should complete within 5 seconds
    });
  });
}); 