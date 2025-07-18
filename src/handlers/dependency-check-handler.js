import { DependafixService } from '../services/dependafix/dependafix-service.js';

/**
 * Dependency Check Handler
 * 
 * Handles manual and scheduled dependency checks for Java projects.
 * Can be triggered via webhook events or API endpoints.
 * 
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleDependencyCheck(context) {
  const { log } = context;
  const { repository } = context.payload;
  
  log.info(`🔍 Starting dependency check for ${repository.full_name}`);
  
  try {
    // Initialize Dependafix service
    const dependafixService = new DependafixService(context);
    
    // Check for outdated dependencies
    const result = await dependafixService.checkOutdatedDependencies(repository);
    
    if (!result.success) {
      log.error(`❌ Dependency check failed: ${result.error}`);
      return {
        success: false,
        error: result.error
      };
    }
    
    log.info(`✅ Dependency check completed successfully`);
    
    // Log summary
    if (result.outdatedDependencies && result.outdatedDependencies.length > 0) {
      log.info(`📦 Found ${result.outdatedDependencies.length} outdated dependencies`);
      
      result.outdatedDependencies.forEach(dep => {
        log.info(`  - ${dep.groupId}:${dep.artifactId} ${dep.currentVersion} → ${dep.latestVersion}`);
      });
    } else {
      log.info(`✅ All dependencies are up to date`);
    }
    

    
    return result;
    
  } catch (error) {
    log.error(`❌ Error in dependency check handler: ${error.message}`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle scheduled dependency checks
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleScheduledDependencyCheck(context) {
  const { log } = context;
  
  log.info(`⏰ Processing scheduled dependency check`);
  
  try {
    // Get repositories that need dependency checks
    const repositories = await getRepositoriesForDependencyCheck(context);
    
    log.info(`📋 Found ${repositories.length} repositories to check`);
    
    const results = [];
    
    for (const repository of repositories) {
      try {
        log.info(`🔍 Checking dependencies for ${repository.full_name}`);
        
        // Create a mock context for the repository
        const mockContext = {
          ...context,
          payload: { repository }
        };
        
        const result = await handleDependencyCheck(mockContext);
        results.push({
          repository: repository.full_name,
          ...result
        });
        
        // Add delay between checks to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        log.error(`❌ Error checking ${repository.full_name}: ${error.message}`);
        results.push({
          repository: repository.full_name,
          success: false,
          error: error.message
        });
      }
    }
    
    log.info(`✅ Scheduled dependency check completed for ${repositories.length} repositories`);
    
    return {
      success: true,
      totalRepositories: repositories.length,
      results
    };
    
  } catch (error) {
    log.error(`❌ Error in scheduled dependency check: ${error.message}`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get repositories that need dependency checks
 * @param {import('probot').Context} context - The Probot context
 * @returns {Promise<Array>} - Array of repositories
 */
async function getRepositoriesForDependencyCheck(context) {
  const { log } = context;
  
  try {
    // Get repositories where the app is installed
    const installations = await context.octokit.rest.apps.listInstallations();
    
    const repositories = [];
    
    for (const installation of installations.data) {
      try {
        // Get repositories for this installation
        const repos = await context.octokit.rest.apps.listReposAccessibleToInstallation({
          installation_id: installation.id
        });
        
        // Filter for Java repositories
        const javaRepos = repos.data.repositories.filter(repo => 
          isJavaRepository(repo)
        );
        
        repositories.push(...javaRepos);
        
      } catch (error) {
        log.warn(`⚠️ Could not get repositories for installation ${installation.id}: ${error.message}`);
      }
    }
    
    return repositories;
    
  } catch (error) {
    log.error(`❌ Error getting repositories: ${error.message}`);
    return [];
  }
}

/**
 * Check if a repository is a Java repository
 * @param {Object} repository - Repository object
 * @returns {boolean} - True if Java repository
 */
function isJavaRepository(repository) {
  // Check for Java-related files in the repository
  const javaFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradle.properties'];
  
  // This is a simplified check - in a real implementation,
  // you would check the actual repository contents
  return repository.language === 'Java' || 
         repository.language === 'Kotlin' ||
         repository.topics?.some(topic => 
           topic.includes('java') || 
           topic.includes('maven') || 
           topic.includes('gradle')
         );
}

/**
 * Handle manual dependency check trigger
 * @param {import('probot').Context} context - The Probot context
 */
export async function handleManualDependencyCheck(context) {
  const { log } = context;
  const { issue, comment } = context.payload;
  
  log.info(`🔍 Manual dependency check triggered by comment on issue #${issue.number}`);
  
  try {
    // Check if the comment contains the trigger command
    const triggerCommand = '/check-dependencies';
    
    if (!comment.body.includes(triggerCommand)) {
      return;
    }
    
    // Get repository from the issue
    const repository = {
      owner: { login: issue.repository.owner.login },
      name: issue.repository.name,
      full_name: issue.repository.full_name,
      default_branch: issue.repository.default_branch
    };
    
    // Create a mock context for the repository
    const mockContext = {
      ...context,
      payload: { repository }
    };
    
    // Run dependency check
    const result = await handleDependencyCheck(mockContext);
    
    // Add comment with results
    await addDependencyCheckComment(context, issue.number, result);
    
    return result;
    
  } catch (error) {
    log.error(`❌ Error in manual dependency check: ${error.message}`, error);
    
    // Add error comment
    await addDependencyCheckComment(context, issue.number, {
      success: false,
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add dependency check results as a comment
 * @param {import('probot').Context} context - The Probot context
 * @param {number} issueNumber - Issue number
 * @param {Object} result - Dependency check result
 */
async function addDependencyCheckComment(context, issueNumber, result) {
  const { log } = context;
  
  try {
    let comment = `## 🔍 Dependency Check Results\n\n`;
    
    if (!result.success) {
      comment += `❌ **Check failed**: ${result.error}\n\n`;
      comment += `Please try again later or contact support if the issue persists.`;
    } else {
      comment += `✅ **Check completed successfully**\n\n`;
      
      if (result.outdatedDependencies && result.outdatedDependencies.length > 0) {
        comment += `📦 **Outdated Dependencies**: ${result.outdatedDependencies.length}\n`;
        comment += `\n| Group ID | Artifact ID | Current | Latest |\n`;
        comment += `|----------|-------------|---------|--------|\n`;
        
        result.outdatedDependencies.forEach(dep => {
          comment += `| ${dep.groupId} | ${dep.artifactId} | \`${dep.currentVersion}\` | \`${dep.latestVersion}\` |\n`;
        });
        
        comment += `\n`;
      } else {
        comment += `✅ **All dependencies are up to date**\n\n`;
      }
      
      
      
      if (result.pullRequest) {
        comment += `🔗 **Pull Request Created**: [PR #${result.pullRequest.number}](${result.pullRequest.html_url})\n\n`;
      }
      
      comment += `---\n*This check was performed by Dependafix 🤖*`;
    }
    
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: issueNumber,
      body: comment
    });
    
    log.info(`✅ Added dependency check comment to issue #${issueNumber}`);
    
  } catch (error) {
    log.error(`❌ Error adding dependency check comment: ${error.message}`);
  }
} 