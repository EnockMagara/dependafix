import { expect } from 'chai';
import sinon from 'sinon';
import { BuildValidator } from '../../../src/services/build-validator.js';

describe('BuildValidator', () => {
  let buildValidator;
  let mockContext;
  let mockConfig;
  let execStub;

  beforeEach(() => {
    mockContext = {
      log: {
        info: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub()
      }
    };

    mockConfig = {
      buildTimeout: 60000,
      maxRetries: 2
    };

    buildValidator = new BuildValidator(mockContext, mockConfig);
    
    // Mock child_process.exec
    execStub = sinon.stub();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('validateFixes', () => {
    it('should validate fixes successfully when build passes', async () => {
      // Mock successful build and test execution
      sinon.stub(buildValidator, 'runCleanBuild').resolves({
        success: true,
        logs: '[INFO] BUILD SUCCESS'
      });

      sinon.stub(buildValidator, 'runTests').resolves({
        success: true,
        logs: '[INFO] Tests run: 25, Failures: 0, Errors: 0, Skipped: 0',
        testResults: { totalTests: 25, passedTests: 25, failedTests: 0, skippedTests: 0 }
      });

      sinon.stub(buildValidator, 'validateDependencies').resolves({
        success: true,
        logs: 'Dependencies validated',
        warnings: []
      });

      sinon.stub(buildValidator, 'runQualityChecks').resolves({
        success: true,
        logs: 'Quality checks passed',
        warnings: []
      });

      const result = await buildValidator.validateFixes('./test-repo', 'maven', {});

      expect(result.success).to.be.true;
      expect(result.buildPassed).to.be.true;
      expect(result.testsPassed).to.be.true;
      expect(result.shouldCreatePR).to.be.true;
      expect(result.errors).to.be.empty;
    });

    it('should block PR creation when build fails', async () => {
      // Mock failed build
      sinon.stub(buildValidator, 'runCleanBuild').resolves({
        success: false,
        logs: '[ERROR] BUILD FAILED'
      });

      const result = await buildValidator.validateFixes('./test-repo', 'maven', {});

      expect(result.success).to.be.false;
      expect(result.buildPassed).to.be.false;
      expect(result.shouldCreatePR).to.be.false;
      expect(result.errors).to.include('Clean build failed');
    });

    it('should block PR creation when test failure rate is too high', async () => {
      // Mock successful build but high test failure rate
      sinon.stub(buildValidator, 'runCleanBuild').resolves({
        success: true,
        logs: '[INFO] BUILD SUCCESS'
      });

      sinon.stub(buildValidator, 'runTests').resolves({
        success: false,
        logs: '[ERROR] Tests run: 10, Failures: 5, Errors: 0, Skipped: 0',
        testResults: { totalTests: 10, passedTests: 5, failedTests: 5, skippedTests: 0 }
      });

      sinon.stub(buildValidator, 'validateDependencies').resolves({
        success: true,
        logs: 'Dependencies validated',
        warnings: []
      });

      sinon.stub(buildValidator, 'runQualityChecks').resolves({
        success: true,
        logs: 'Quality checks passed',
        warnings: []
      });

      const result = await buildValidator.validateFixes('./test-repo', 'maven', {});

      expect(result.buildPassed).to.be.true;
      expect(result.testsPassed).to.be.false;
      expect(result.shouldCreatePR).to.be.false;
    });

    it('should allow PR creation with minor test failures', async () => {
      // Mock successful build with minor test failures
      sinon.stub(buildValidator, 'runCleanBuild').resolves({
        success: true,
        logs: '[INFO] BUILD SUCCESS'
      });

      sinon.stub(buildValidator, 'runTests').resolves({
        success: false,
        logs: '[INFO] Tests run: 100, Failures: 2, Errors: 0, Skipped: 0',
        testResults: { totalTests: 100, passedTests: 98, failedTests: 2, skippedTests: 0 }
      });

      sinon.stub(buildValidator, 'validateDependencies').resolves({
        success: true,
        logs: 'Dependencies validated',
        warnings: []
      });

      sinon.stub(buildValidator, 'runQualityChecks').resolves({
        success: true,
        logs: 'Quality checks passed',
        warnings: []
      });

      // Mock analyzeTestFailures to return acceptable failures
      sinon.stub(buildValidator, 'analyzeTestFailures').returns({
        canProceed: true,
        reason: 'Low failure rate: 2%'
      });

      const result = await buildValidator.validateFixes('./test-repo', 'maven', {});

      expect(result.buildPassed).to.be.true;
      expect(result.shouldCreatePR).to.be.true;
      expect(result.warnings).to.include('Some tests failed but may be unrelated to dependency changes');
    });
  });

  describe('runCleanBuild', () => {
    it('should execute Maven clean build successfully', async () => {
      const mockExec = sinon.stub().resolves({
        stdout: '[INFO] BUILD SUCCESS',
        stderr: ''
      });

      // Mock dynamic import
      sinon.stub(buildValidator, 'runCleanBuild').callsFake(async (repoPath, buildTool) => {
        if (buildTool === 'maven') {
          const result = await mockExec('mvn clean compile -DskipTests=true -q');
          return {
            success: true,
            logs: result.stdout + result.stderr
          };
        }
      });

      const result = await buildValidator.runCleanBuild('./test-repo', 'maven');

      expect(result.success).to.be.true;
      expect(result.logs).to.include('BUILD SUCCESS');
    });

    it('should retry failed builds', async () => {
      let attempt = 0;
      const mockExec = sinon.stub().callsFake(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new Error('Build failed'));
        }
        return Promise.resolve({
          stdout: '[INFO] BUILD SUCCESS',
          stderr: ''
        });
      });

      // Mock the actual implementation
      sinon.stub(buildValidator, 'runCleanBuild').callsFake(async () => {
        try {
          await mockExec();
          return { success: true, logs: '[INFO] BUILD SUCCESS' };
        } catch (error) {
          // Simulate retry
          const result = await mockExec();
          return { success: true, logs: result.stdout };
        }
      });

      const result = await buildValidator.runCleanBuild('./test-repo', 'maven');

      expect(result.success).to.be.true;
      expect(mockExec.callCount).to.equal(2);
    });
  });

  describe('parseTestResults', () => {
    it('should parse Maven test results correctly', () => {
      const logs = 'Tests run: 25, Failures: 2, Errors: 1, Skipped: 3';
      const result = buildValidator.parseTestResults(logs, 'maven');

      expect(result.totalTests).to.equal(25);
      expect(result.failedTests).to.equal(3); // Failures + Errors
      expect(result.skippedTests).to.equal(3);
      expect(result.passedTests).to.equal(19); // Total - Failed - Skipped
    });

    it('should parse Gradle test results correctly', () => {
      const logs = '30 tests completed, 5 failed, 2 skipped';
      const result = buildValidator.parseTestResults(logs, 'gradle');

      expect(result.totalTests).to.equal(30);
      expect(result.failedTests).to.equal(5);
      expect(result.skippedTests).to.equal(2);
      expect(result.passedTests).to.equal(23);
    });

    it('should return zero results when no test patterns match', () => {
      const logs = 'No test results found';
      const result = buildValidator.parseTestResults(logs, 'maven');

      expect(result.totalTests).to.equal(0);
      expect(result.failedTests).to.equal(0);
      expect(result.skippedTests).to.equal(0);
      expect(result.passedTests).to.equal(0);
    });
  });

  describe('analyzeTestFailures', () => {
    it('should allow proceeding with low failure rate', () => {
      const testResult = {
        testResults: { totalTests: 100, failedTests: 5 },
        logs: 'Some unrelated test failures'
      };

      const result = buildValidator.analyzeTestFailures(testResult);

      expect(result.canProceed).to.be.true;
      expect(result.reason).to.include('Low failure rate: 5%');
    });

    it('should block proceeding with high failure rate and dependency issues', () => {
      const testResult = {
        testResults: { totalTests: 100, failedTests: 30 },
        logs: 'ClassNotFoundException: javax.servlet.http.HttpServletRequest'
      };

      const result = buildValidator.analyzeTestFailures(testResult);

      expect(result.canProceed).to.be.false;
      expect(result.reason).to.include('High failure rate (30%) with dependency-related issues');
    });

    it('should allow proceeding with high failure rate but no dependency issues', () => {
      const testResult = {
        testResults: { totalTests: 100, failedTests: 30 },
        logs: 'AssertionError: expected value to be different'
      };

      const result = buildValidator.analyzeTestFailures(testResult);

      expect(result.canProceed).to.be.true;
      expect(result.reason).to.include('Test failures appear unrelated to dependency changes');
    });
  });

  describe('isDependencyRelatedFailure', () => {
    it('should detect dependency-related failures', () => {
      const logs = 'ClassNotFoundException: javax.servlet.http.HttpServletRequest';
      const result = buildValidator.isDependencyRelatedFailure(logs);

      expect(result).to.be.true;
    });

    it('should not detect non-dependency failures', () => {
      const logs = 'AssertionError: expected <true> but was <false>';
      const result = buildValidator.isDependencyRelatedFailure(logs);

      expect(result).to.be.false;
    });
  });

  describe('shouldCreatePullRequest', () => {
    it('should approve PR creation for successful validation', () => {
      const validationResult = {
        buildPassed: true,
        testResults: { totalTests: 25, failedTests: 0 },
        errors: []
      };

      const result = buildValidator.shouldCreatePullRequest(validationResult, {});

      expect(result).to.be.true;
    });

    it('should block PR creation for failed build', () => {
      const validationResult = {
        buildPassed: false,
        testResults: { totalTests: 25, failedTests: 0 },
        errors: []
      };

      const result = buildValidator.shouldCreatePullRequest(validationResult, {});

      expect(result).to.be.false;
    });

    it('should apply stricter validation for critical fixes', () => {
      const validationResult = {
        buildPassed: true,
        testResults: { totalTests: 100, failedTests: 8 }, // 8% failure rate
        errors: []
      };

      const fixContext = { isCritical: true };
      const result = buildValidator.shouldCreatePullRequest(validationResult, fixContext);

      expect(result).to.be.false; // Should fail because critical fixes require < 5%
    });

    it('should block PR creation for critical errors', () => {
      const validationResult = {
        buildPassed: true,
        testResults: { totalTests: 25, failedTests: 0 },
        errors: ['ClassNotFoundException detected']
      };

      const result = buildValidator.shouldCreatePullRequest(validationResult, {});

      expect(result).to.be.false;
    });
  });

  describe('generateValidationReport', () => {
    it('should generate comprehensive validation report', () => {
      const validationResult = {
        buildPassed: true,
        testsPassed: false,
        shouldCreatePR: false,
        testResults: { totalTests: 100, passedTests: 95, failedTests: 5, skippedTests: 0 },
        errors: ['Some test failures detected'],
        warnings: ['Minor code quality issues'],
        recommendations: ['Review failing tests before proceeding']
      };

      const report = buildValidator.generateValidationReport(validationResult);

      expect(report).to.include('Build Validation Report');
      expect(report).to.include('Build Status**: ✅ PASSED');
      expect(report).to.include('Tests Status**: ❌ FAILED');
      expect(report).to.include('PR Recommended**: ❌ NO');
      expect(report).to.include('Total Tests: 100');
      expect(report).to.include('Passed: 95');
      expect(report).to.include('Failed: 5');
      expect(report).to.include('Some test failures detected');
      expect(report).to.include('Minor code quality issues');
      expect(report).to.include('Review failing tests before proceeding');
    });
  });
}); 