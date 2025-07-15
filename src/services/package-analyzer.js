/**
 * Service for analyzing package.json changes
 */
export class PackageJsonAnalyzer {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Check if any commits modified package.json
   * @param {Array} commits - Array of commit objects
   * @returns {boolean} - True if package.json was modified
   */
  async hasPackageJsonChanges(commits) {
    return commits.some(commit => {
      const modified = commit.modified || [];
      const added = commit.added || [];
      const removed = commit.removed || [];
      
      return [...modified, ...added, ...removed].some(file => 
        file === 'package.json' || file.endsWith('/package.json')
      );
    });
  }

  /**
   * Analyze package.json changes for potential issues
   * @param {Array} commits - Array of commit objects
   * @returns {Array} - Array of detected issues
   */
  async analyzeChanges(commits) {
    const issues = [];
    const { repository } = this.context.payload;
    
    try {
      // Get the current package.json content
      const packageJsonContent = await this.getPackageJsonContent();
      
      if (!packageJsonContent) {
        this.log.warn('Could not retrieve package.json content');
        return issues;
      }
      
      const packageJson = JSON.parse(packageJsonContent);
      
      // Check for common issues
      issues.push(...this.checkForDeprecatedPackages(packageJson));
      issues.push(...this.checkForSecurityVulnerabilities(packageJson));
      issues.push(...this.checkForVersionConflicts(packageJson));
      
      this.log.info(`Analyzed package.json, found ${issues.length} issues`);
      
    } catch (error) {
      this.log.error(`Error analyzing package.json: ${error.message}`);
    }
    
    return issues;
  }

  /**
   * Get the current package.json content from the repository
   * @returns {string|null} - The package.json content or null if not found
   */
  async getPackageJsonContent() {
    try {
      const { repository } = this.context.payload;
      const response = await this.octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: 'package.json',
      });
      
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      this.log.error(`Error getting package.json content: ${error.message}`);
      return null;
    }
  }

  /**
   * Check for deprecated packages
   * @param {Object} packageJson - The parsed package.json
   * @returns {Array} - Array of deprecated package issues
   */
  checkForDeprecatedPackages(packageJson) {
    const issues = [];
    const deprecatedPackages = [
      'request', 'babel-core', 'babel-preset-es2015', 'babel-preset-stage-0'
    ];
    
    const allDeps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {}
    };
    
    for (const [pkg, version] of Object.entries(allDeps)) {
      if (deprecatedPackages.includes(pkg)) {
        issues.push({
          type: 'deprecated_package',
          package: pkg,
          version: version,
          message: `Package "${pkg}" is deprecated and should be replaced`,
          severity: 'warning'
        });
      }
    }
    
    return issues;
  }

  /**
   * Check for potential security vulnerabilities
   * @param {Object} packageJson - The parsed package.json
   * @returns {Array} - Array of security issues
   */
  checkForSecurityVulnerabilities(packageJson) {
    const issues = [];
    
    // This is a simplified check - in a real implementation,
    // you would integrate with security databases
    const vulnerablePackages = {
      'lodash': '^4.17.20', // Example: versions below 4.17.21 have vulnerabilities
      'axios': '^0.21.0'    // Example: versions below 0.21.1 have vulnerabilities
    };
    
    const allDeps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {}
    };
    
    for (const [pkg, currentVersion] of Object.entries(allDeps)) {
      if (vulnerablePackages[pkg]) {
        issues.push({
          type: 'security_vulnerability',
          package: pkg,
          version: currentVersion,
          recommendedVersion: vulnerablePackages[pkg],
          message: `Package "${pkg}" may have security vulnerabilities`,
          severity: 'high'
        });
      }
    }
    
    return issues;
  }

  /**
   * Check for version conflicts
   * @param {Object} packageJson - The parsed package.json
   * @returns {Array} - Array of version conflict issues
   */
  checkForVersionConflicts(packageJson) {
    const issues = [];
    
    // Check for peer dependency conflicts
    const dependencies = packageJson.dependencies || {};
    const peerDependencies = packageJson.peerDependencies || {};
    
    for (const [pkg, peerVersion] of Object.entries(peerDependencies)) {
      if (dependencies[pkg] && dependencies[pkg] !== peerVersion) {
        issues.push({
          type: 'version_conflict',
          package: pkg,
          version: dependencies[pkg],
          peerVersion: peerVersion,
          message: `Version conflict: ${pkg} dependency doesn't match peer dependency requirement`,
          severity: 'medium'
        });
      }
    }
    
    return issues;
  }
} 