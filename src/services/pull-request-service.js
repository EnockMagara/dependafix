import { FixGenerator } from './fix-generator.js';

/**
 * Service for creating and managing pull requests
 */
export class PullRequestService {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    this.repository = context.payload.repository;
  }

  /**
   * Create a pull request with the generated fixes
   * @param {Array} fixes - Array of fixes to apply
   * @returns {Object} - The created pull request
   */
  async createFixPullRequest(fixes) {
    const branchName = `dependency-bot/fixes-${Date.now()}`;
    
    try {
      // Create a new branch
      await this.createBranch(branchName);
      
      // Apply fixes to the branch
      await this.applyFixes(fixes, branchName);
      
      // Create pull request
      const pullRequest = await this.createPullRequest(fixes, branchName);
      
      return pullRequest;
    } catch (error) {
      this.log.error(`Error creating pull request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new branch from the default branch
   * @param {string} branchName - Name of the new branch
   */
  async createBranch(branchName) {
    const defaultBranch = this.repository.default_branch;
    
    // Get the SHA of the default branch
    const refResponse = await this.octokit.rest.git.getRef({
      owner: this.repository.owner.login,
      repo: this.repository.name,
      ref: `heads/${defaultBranch}`,
    });
    
    const baseSha = refResponse.data.object.sha;
    
    // Create the new branch
    await this.octokit.rest.git.createRef({
      owner: this.repository.owner.login,
      repo: this.repository.name,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    
    this.log.info(`Created branch: ${branchName}`);
  }

  /**
   * Apply fixes to the branch
   * @param {Array} fixes - Array of fixes to apply
   * @param {string} branchName - Name of the branch to apply fixes to
   */
  async applyFixes(fixes, branchName) {
    for (const fix of fixes) {
      try {
        await this.applyFix(fix, branchName);
      } catch (error) {
        this.log.error(`Error applying fix ${fix.type}: ${error.message}`);
      }
    }
  }

  /**
   * Apply a single fix to the branch
   * @param {Object} fix - The fix to apply
   * @param {string} branchName - Name of the branch
   */
  async applyFix(fix, branchName) {
    switch (fix.type) {
      case 'package_replacement':
      case 'version_update':
      case 'version_alignment':
        await this.updatePackageJson(fix, branchName);
        break;
      case 'manual_fix':
        await this.createManualFixFile(fix, branchName);
        break;
      default:
        this.log.warn(`Unknown fix type: ${fix.type}`);
    }
  }

  /**
   * Update package.json with the fix
   * @param {Object} fix - The fix to apply
   * @param {string} branchName - Name of the branch
   */
  async updatePackageJson(fix, branchName) {
    try {
      // Get current package.json
      const packageJsonResponse = await this.octokit.rest.repos.getContent({
        owner: this.repository.owner.login,
        repo: this.repository.name,
        path: 'package.json',
        ref: branchName,
      });
      
      const packageJsonContent = Buffer.from(packageJsonResponse.data.content, 'base64').toString('utf8');
      const packageJson = JSON.parse(packageJsonContent);
      
      // Apply the fix
      this.applyFixToPackageJson(packageJson, fix);
      
      // Update the file
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.repository.owner.login,
        repo: this.repository.name,
        path: 'package.json',
        message: `${fix.description}\n\n${fix.instructions}`,
        content: Buffer.from(JSON.stringify(packageJson, null, 2) + '\n').toString('base64'),
        sha: packageJsonResponse.data.sha,
        branch: branchName,
      });
      
      this.log.info(`Updated package.json for fix: ${fix.description}`);
    } catch (error) {
      this.log.error(`Error updating package.json: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply fix to package.json object
   * @param {Object} packageJson - The package.json object
   * @param {Object} fix - The fix to apply
   */
  applyFixToPackageJson(packageJson, fix) {
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    
    switch (fix.type) {
      case 'package_replacement':
        // Remove old package and add new one
        if (dependencies[fix.oldPackage]) {
          delete dependencies[fix.oldPackage];
          dependencies[fix.newPackage] = fix.newVersion;
        }
        if (devDependencies[fix.oldPackage]) {
          delete devDependencies[fix.oldPackage];
          devDependencies[fix.newPackage] = fix.newVersion;
        }
        break;
        
      case 'version_update':
      case 'version_alignment':
        // Update version
        if (dependencies[fix.package]) {
          dependencies[fix.package] = fix.newVersion;
        }
        if (devDependencies[fix.package]) {
          devDependencies[fix.package] = fix.newVersion;
        }
        break;
    }
    
    packageJson.dependencies = dependencies;
    packageJson.devDependencies = devDependencies;
  }

  /**
   * Create a manual fix file for issues that require manual intervention
   * @param {Object} fix - The manual fix
   * @param {string} branchName - Name of the branch
   */
  async createManualFixFile(fix, branchName) {
    const fixGenerator = new FixGenerator(this.context);
    const content = fixGenerator.generateFixDocumentation(fix);
    
    const fileName = `DEPENDENCY_FIX_${fix.issue.package.toUpperCase()}.md`;
    
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.repository.owner.login,
      repo: this.repository.name,
      path: fileName,
      message: `Add manual fix documentation for ${fix.issue.package}`,
      content: Buffer.from(content).toString('base64'),
      branch: branchName,
    });
    
    this.log.info(`Created manual fix file: ${fileName}`);
  }

  /**
   * Create the pull request
   * @param {Array} fixes - Array of applied fixes
   * @param {string} branchName - Name of the branch with fixes
   * @returns {Object} - The created pull request
   */
  async createPullRequest(fixes, branchName) {
    const title = this.generatePullRequestTitle(fixes);
    const body = this.generatePullRequestBody(fixes);
    
    const pullRequest = await this.octokit.rest.pulls.create({
      owner: this.repository.owner.login,
      repo: this.repository.name,
      title: title,
      head: branchName,
      base: this.repository.default_branch,
      body: body,
    });
    
    this.log.info(`Created pull request #${pullRequest.data.number}: ${pullRequest.data.html_url}`);
    
    return pullRequest.data;
  }

  /**
   * Generate pull request title
   * @param {Array} fixes - Array of fixes
   * @returns {string} - Pull request title
   */
  generatePullRequestTitle(fixes) {
    if (fixes.length === 1) {
      return `🔧 ${fixes[0].description}`;
    }
    
    const fixTypes = [...new Set(fixes.map(fix => fix.type))];
    return `🔧 Fix ${fixes.length} dependency issues (${fixTypes.join(', ')})`;
  }

  /**
   * Generate pull request body
   * @param {Array} fixes - Array of fixes
   * @returns {string} - Pull request body
   */
  generatePullRequestBody(fixes) {
    let body = '## 🤖 Automated Dependency Fixes\n\n';
    body += 'This pull request contains automated fixes for dependency issues detected in your `package.json`.\n\n';
    
    body += '### Summary\n\n';
    body += `- **Total fixes**: ${fixes.length}\n`;
    
    const fixTypeCount = fixes.reduce((acc, fix) => {
      acc[fix.type] = (acc[fix.type] || 0) + 1;
      return acc;
    }, {});
    
    for (const [type, count] of Object.entries(fixTypeCount)) {
      body += `- **${type.replace('_', ' ')}**: ${count}\n`;
    }
    
    body += '\n### Detailed Changes\n\n';
    
    fixes.forEach((fix, index) => {
      body += `#### ${index + 1}. ${fix.description}\n\n`;
      body += `**Severity**: ${fix.issue.severity}\n`;
      body += `**Type**: ${fix.issue.type}\n\n`;
      
      if (fix.instructions) {
        body += `**Instructions**: ${fix.instructions}\n\n`;
      }
      
      if (fix.type === 'package_replacement') {
        body += `**Changes**:\n`;
        body += `- ❌ Remove: \`${fix.oldPackage}\`\n`;
        body += `- ✅ Add: \`${fix.newPackage}@${fix.newVersion}\`\n\n`;
      } else if (fix.type === 'version_update' || fix.type === 'version_alignment') {
        body += `**Changes**:\n`;
        body += `- 🔄 Update \`${fix.package}\` from \`${fix.currentVersion}\` to \`${fix.newVersion}\`\n\n`;
      }
      
      body += '---\n\n';
    });
    
    body += '### Next Steps\n\n';
    body += '1. Review the changes in this pull request\n';
    body += '2. Test your application to ensure everything works correctly\n';
    body += '3. Merge this pull request if the changes look good\n';
    body += '4. Run `npm install` or `yarn install` to update your dependencies\n\n';
    
    body += '*This pull request was created automatically by Dependency Bot 🤖*';
    
    return body;
  }
} 