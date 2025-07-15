import { PackageJsonAnalyzer } from '../services/package-analyzer.js';
import { FixGenerator } from '../services/fix-generator.js';
import { PullRequestService } from '../services/pull-request-service.js';

/**
 * Handles push events from GitHub
 * @param {import('probot').Context} context - The Probot context
 */
export async function handlePushEvent(context) {
  const { log } = context;
  const { repository, commits } = context.payload;
  
  log.info(`🚀 Processing push event for ${repository.full_name}`);
  
  try {
    // Check if package.json was modified
    const packageJsonAnalyzer = new PackageJsonAnalyzer(context);
    const hasPackageJsonChanges = await packageJsonAnalyzer.hasPackageJsonChanges(commits);
    
    if (!hasPackageJsonChanges) {
      log.info(`❌ No package.json changes detected in ${repository.full_name}`);
      return;
    }
    
    log.info(`✅ Detected package.json changes in ${repository.full_name}`);
    
    // Analyze the changes for potential issues
    const issues = await packageJsonAnalyzer.analyzeChanges(commits);
    
    if (issues.length === 0) {
      log.info(`✅ No issues detected in package.json changes`);
      return;
    }
    
    log.info(`🔍 Found ${issues.length} potential issues`);
    
    // Generate fixes for the issues
    const fixGenerator = new FixGenerator(context);
    const fixes = await fixGenerator.generateFixes(issues);
    
    if (fixes.length === 0) {
      log.info(`❌ No fixes could be generated`);
      return;
    }
    
    // Create pull request with fixes
    const prService = new PullRequestService(context);
    const pullRequest = await prService.createFixPullRequest(fixes);
    
    log.info(`🎉 Created PR #${pullRequest.number}: ${pullRequest.html_url}`);
    
  } catch (error) {
    log.error(`❌ Error processing push event: ${error.message}`, error);
  }
} 