import { RepositoryManager } from './repository-manager.js';
import { BuildRunner } from './build-runner.js';
import { LogAnalyzer } from './log-analyzer.js';
import { ByamClient } from '../byam/byam-client.js';
import { FixValidator } from './fix-validator.js';
import { PullRequestCreator } from './pull-request-creator.js';
import { JavaDependencyChecker } from '../java-dependency-checker.js';

/**
 * Dependafix Service - Main orchestrator for dependency fix automation
 * 
 * Design Patterns Used:
 * - Facade Pattern: Provides a simplified interface to complex subsystems
 * - Strategy Pattern: Different strategies for Maven vs Gradle builds
 * - Chain of Responsibility: Processing pipeline for fix generation
 * - Observer Pattern: Event-driven processing
 */
export class DependafixService {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = {
      maxRetries: 3,
      buildTimeout: 300000, // 5 minutes
      supportedBuildTools: ['maven', 'gradle'],
      ...config
    };
    
    // Initialize components using Dependency Injection
    this.repositoryManager = new RepositoryManager(context);
    this.buildRunner = new BuildRunner(context, this.config);
    this.logAnalyzer = new LogAnalyzer(context);
    this.byamClient = new ByamClient(context, this.config);
    this.fixValidator = new FixValidator(context, this.config);
    this.pullRequestCreator = new PullRequestCreator(context);
    this.dependencyChecker = new JavaDependencyChecker(context, this.config);
    
    // Event handlers for different webhook types
    this.eventHandlers = new Map([
      ['pull_request', this.handlePullRequest.bind(this)],
      ['push', this.handlePush.bind(this)]
    ]);
  }

  /**
   * Main entry point for processing webhook events
   * @param {string} eventType - Type of webhook event
   * @param {Object} payload - Webhook payload
   * @returns {Promise<Object>} - Processing result
   */
  async processWebhookEvent(eventType, payload) {
    const handler = this.eventHandlers.get(eventType);
    if (!handler) {
      this.log.warn(`Unsupported event type: ${eventType}`);
      return { success: false, error: `Unsupported event type: ${eventType}` };
    }

    try {
      this.log.info(`🚀 Processing ${eventType} event for ${payload.repository.full_name}`);
      return await handler(payload);
    } catch (error) {
      this.log.error(`❌ Error processing ${eventType} event: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle pull request events
   * @param {Object} payload - PR webhook payload
   * @returns {Promise<Object>} - Processing result
   */
  async handlePullRequest(payload) {
    const { action, pull_request: pr } = payload;
    
    // Only process opened PRs that modify dependencies
    if (action !== 'opened' && action !== 'synchronize') {
      this.log.info(`Skipping PR action: ${action}`);
      return { success: true, skipped: true, reason: `Action ${action} not processed` };
    }

    const isDependencyUpdate = await this.isDependencyUpdatePR(pr);
    if (!isDependencyUpdate) {
      this.log.info(`PR #${pr.number} is not a dependency update`);
      return { success: true, skipped: true, reason: 'Not a dependency update' };
    }

    return await this.processDependencyUpdate(payload.repository, pr);
  }

  /**
   * Handle push events
   * @param {Object} payload - Push webhook payload
   * @returns {Promise<Object>} - Processing result
   */
  async handlePush(payload) {
    const { repository, commits } = payload;
    
    // Check if any commits modified dependency files
    const hasDependencyChanges = commits.some(commit => 
      this.hasDependencyFileChanges(commit)
    );

    if (!hasDependencyChanges) {
      this.log.info(`No dependency changes detected in push to ${repository.full_name}`);
      return { success: true, skipped: true, reason: 'No dependency changes' };
    }

    return await this.processDependencyUpdate(repository, null, commits);
  }

  /**
   * Main processing pipeline for dependency updates
   * @param {Object} repository - Repository information
   * @param {Object} pr - Pull request (optional)
   * @param {Array} commits - Commits (optional)
   * @returns {Promise<Object>} - Processing result
   */
  async processDependencyUpdate(repository, pr = null, commits = null) {
    const processingId = `${repository.full_name}-${Date.now()}`;
    this.log.info(`🔄 Starting dependency update processing [${processingId}]`);

    try {
      // Step 1: Repository checkout and setup
      const repoPath = await this.repositoryManager.checkoutRepository(repository, pr);
      this.log.info(`✅ Repository checked out to: ${repoPath}`);

      // Step 2: Detect build tool and run build
      const buildTool = await this.buildRunner.detectBuildTool(repoPath);
      this.log.info(`🔧 Detected build tool: ${buildTool}`);

      const buildResult = await this.buildRunner.runBuild(repoPath, buildTool);
      
      if (buildResult.success) {
        this.log.info(`✅ Build successful - no fixes needed`);
        return { success: true, buildSuccessful: true, processingId };
      }

      this.log.info(`❌ Build failed - analyzing logs for fixes`);

      // Step 3: Analyze build logs
      const logAnalysis = await this.logAnalyzer.analyzeBuildLogs(
        buildResult.logs,
        buildTool,
        repoPath
      );

      if (logAnalysis.issues.length === 0) {
        this.log.warn(`No fixable issues found in build logs`);
        return { success: false, error: 'No fixable issues detected', processingId };
      }

      this.log.info(`🔍 Found ${logAnalysis.issues.length} fixable issues`);

      // Step 4: Send to Byam for fix generation
      const byamRequest = {
        repository: repository.full_name,
        buildTool,
        buildLogs: buildResult.logs,
        issues: logAnalysis.issues,
        dependencyInfo: logAnalysis.dependencyInfo,
        processingId
      };

      const byamResponse = await this.byamClient.generateFixes(byamRequest);

      if (!byamResponse.success || byamResponse.fixes.length === 0) {
        this.log.error(`❌ Byam failed to generate fixes`);
        return { success: false, error: 'Fix generation failed', processingId };
      }

      this.log.info(`✅ Byam generated ${byamResponse.fixes.length} fixes`);

      // Step 5: Apply fixes using Use Case Orchestrator
      const { UseCaseOrchestrator } = await import('../use-cases/use-case-orchestrator.js');
      const orchestrator = new UseCaseOrchestrator(this.context, this.config);
      
      // Extract library info from dependency analysis
      const libraryInfo = logAnalysis.dependencyInfo || {
        name: 'dependency-update',
        oldVersion: 'unknown',
        newVersion: 'unknown'
      };

      // Run comprehensive orchestration with build validation
      const orchestrationResults = await orchestrator.orchestrateDependencyUpdateFixes(
        buildResult.logs,
        repoPath,
        libraryInfo
      );

      if (!orchestrationResults.success) {
        this.log.error(`❌ Orchestration failed`);
        return { success: false, error: 'Fix orchestration failed', processingId };
      }

      this.log.info(`✅ Orchestration completed with ${orchestrationResults.totalFixesApplied} fixes`);

      // Step 6: CRITICAL BUILD VALIDATION - Only create PR if build passes
      if (!orchestrationResults.shouldCreatePR) {
        this.log.error(`❌ BUILD VALIDATION FAILED - PR creation blocked`);
        return { 
          success: false, 
          error: 'Build validation failed - fixes did not resolve all issues',
          processingId,
          orchestrationResults
        };
      }

      this.log.info(`🎉 BUILD VALIDATION PASSED - Creating PR`);

      // Step 7: Create pull request with validated fixes
      const prResult = await orchestrator.createComprehensivePullRequest(
        orchestrationResults,
        libraryInfo,
        repoPath
      );

      if (!prResult.success) {
        this.log.error(`❌ Failed to create PR: ${prResult.error}`);
        return { success: false, error: prResult.error, processingId };
      }

      this.log.info(`🎉 Created validated fix PR: ${prResult.html_url}`);

      return {
        success: true,
        processingId,
        fixPullRequest: prResult,
        issuesFixed: orchestrationResults.totalIssuesFound,
        appliedFixes: orchestrationResults.totalFixesApplied,
        buildValidated: true,
        orchestrationResults
      };

    } catch (error) {
      this.log.error(`❌ Processing failed [${processingId}]: ${error.message}`, error);
      return { success: false, error: error.message, processingId };
    } finally {
      // Cleanup
      await this.repositoryManager.cleanup(processingId);
    }
  }

  /**
   * Check if PR is a dependency update
   * @param {Object} pr - Pull request object
   * @returns {Promise<boolean>} - True if dependency update
   */
  async isDependencyUpdatePR(pr) {
    // Check PR title and body for dependency-related keywords
    const dependencyKeywords = [
      'bump', 'update', 'upgrade', 'dependency', 'dependencies',
      'maven', 'gradle', 'pom.xml', 'build.gradle', 'version'
    ];

    const text = `${pr.title} ${pr.body}`.toLowerCase();
    return dependencyKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if commit has dependency file changes
   * @param {Object} commit - Commit object
   * @returns {boolean} - True if has dependency changes
   */
  hasDependencyFileChanges(commit) {
    const dependencyFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradle.properties'];
    const allFiles = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
    
    return allFiles.some(file => 
      dependencyFiles.some(depFile => file.includes(depFile))
    );
  }

  /**
   * Check for outdated Java dependencies
   * @param {Object} repository - Repository information
   * @returns {Promise<Object>} - Dependency check result
   */
  async checkOutdatedDependencies(repository) {
    this.log.info(`🔍 Checking outdated dependencies for ${repository.full_name}`);

    try {
      // Step 1: Repository checkout
      const repoPath = await this.repositoryManager.checkoutRepository(repository);
      this.log.info(`✅ Repository checked out to: ${repoPath}`);

      // Step 2: Check for outdated dependencies
      const dependencyResult = await this.dependencyChecker.checkOutdatedDependencies(repoPath);

      if (!dependencyResult.success) {
        this.log.error(`❌ Dependency check failed: ${dependencyResult.error}`);
        return dependencyResult;
      }

      this.log.info(`✅ Found ${dependencyResult.outdatedDependencies.length} outdated dependencies`);

      // Step 3: Create pull request if there are outdated dependencies
      if (dependencyResult.outdatedDependencies.length > 0) {
        const prResult = await this.pullRequestCreator.createDependencyUpdatePR(
          repository,
          dependencyResult,
          {
            buildTool: dependencyResult.buildTool,
            report: dependencyResult.report
          }
        );

        this.log.info(`🎉 Created dependency update PR #${prResult.number}: ${prResult.html_url}`);

        return {
          success: true,
          outdatedDependencies: dependencyResult.outdatedDependencies,
          pullRequest: prResult,
          report: dependencyResult.report
        };
      }

      return {
        success: true,
        outdatedDependencies: [],
        message: 'All dependencies are up to date',
        report: dependencyResult.report
      };

    } catch (error) {
      this.log.error(`❌ Error checking outdated dependencies: ${error.message}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get dependency update commands for manual execution
   * @param {string} buildTool - Build tool name
   * @returns {Object} - Update commands
   */
  getDependencyUpdateCommands(buildTool) {
    return this.dependencyChecker.getUpdateCommands(buildTool);
  }
} 