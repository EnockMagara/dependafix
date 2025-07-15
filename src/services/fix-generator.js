/**
 * Service for generating fixes for detected issues
 */
export class FixGenerator {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Generate fixes for the detected issues
   * @param {Array} issues - Array of detected issues
   * @returns {Array} - Array of generated fixes
   */
  async generateFixes(issues) {
    const fixes = [];
    
    for (const issue of issues) {
      try {
        const fix = await this.generateFixForIssue(issue);
        if (fix) {
          fixes.push(fix);
        }
      } catch (error) {
        this.log.error(`Error generating fix for issue ${issue.type}: ${error.message}`);
      }
    }
    
    return fixes;
  }

  /**
   * Generate a fix for a specific issue
   * @param {Object} issue - The issue to fix
   * @returns {Object|null} - The generated fix or null if no fix available
   */
  async generateFixForIssue(issue) {
    switch (issue.type) {
      case 'deprecated_package':
        return this.generateDeprecatedPackageFix(issue);
      case 'security_vulnerability':
        return this.generateSecurityFix(issue);
      case 'version_conflict':
        return this.generateVersionConflictFix(issue);
      default:
        this.log.warn(`Unknown issue type: ${issue.type}`);
        return null;
    }
  }

  /**
   * Generate fix for deprecated package
   * @param {Object} issue - The deprecated package issue
   * @returns {Object} - The fix object
   */
  generateDeprecatedPackageFix(issue) {
    const replacements = {
      'request': {
        package: 'axios',
        version: '^1.0.0',
        instructions: 'Replace request with axios for HTTP requests'
      },
      'babel-core': {
        package: '@babel/core',
        version: '^7.0.0',
        instructions: 'Replace babel-core with @babel/core'
      },
      'babel-preset-es2015': {
        package: '@babel/preset-env',
        version: '^7.0.0',
        instructions: 'Replace babel-preset-es2015 with @babel/preset-env'
      }
    };

    const replacement = replacements[issue.package];
    if (!replacement) {
      return {
        type: 'manual_fix',
        issue: issue,
        description: `Manual intervention required for deprecated package: ${issue.package}`,
        instructions: `Please manually replace ${issue.package} with a modern alternative`
      };
    }

    return {
      type: 'package_replacement',
      issue: issue,
      description: `Replace deprecated package ${issue.package} with ${replacement.package}`,
      oldPackage: issue.package,
      newPackage: replacement.package,
      newVersion: replacement.version,
      instructions: replacement.instructions,
      files: [{
        path: 'package.json',
        action: 'update_dependency'
      }]
    };
  }

  /**
   * Generate fix for security vulnerability
   * @param {Object} issue - The security vulnerability issue
   * @returns {Object} - The fix object
   */
  generateSecurityFix(issue) {
    return {
      type: 'version_update',
      issue: issue,
      description: `Update ${issue.package} to fix security vulnerability`,
      package: issue.package,
      currentVersion: issue.version,
      newVersion: issue.recommendedVersion,
      instructions: `Update ${issue.package} from ${issue.version} to ${issue.recommendedVersion}`,
      files: [{
        path: 'package.json',
        action: 'update_dependency'
      }]
    };
  }

  /**
   * Generate fix for version conflict
   * @param {Object} issue - The version conflict issue
   * @returns {Object} - The fix object
   */
  generateVersionConflictFix(issue) {
    return {
      type: 'version_alignment',
      issue: issue,
      description: `Align ${issue.package} version to match peer dependency requirement`,
      package: issue.package,
      currentVersion: issue.version,
      newVersion: issue.peerVersion,
      instructions: `Update ${issue.package} from ${issue.version} to ${issue.peerVersion} to match peer dependency`,
      files: [{
        path: 'package.json',
        action: 'update_dependency'
      }]
    };
  }

  /**
   * Generate documentation for the fix
   * @param {Object} fix - The fix object
   * @returns {string} - Markdown documentation for the fix
   */
  generateFixDocumentation(fix) {
    let documentation = `## ${fix.description}\n\n`;
    
    documentation += `**Issue Type:** ${fix.issue.type}\n`;
    documentation += `**Severity:** ${fix.issue.severity}\n\n`;
    
    if (fix.instructions) {
      documentation += `**Instructions:**\n${fix.instructions}\n\n`;
    }
    
    if (fix.type === 'package_replacement') {
      documentation += `**Changes:**\n`;
      documentation += `- Remove: \`${fix.oldPackage}\`\n`;
      documentation += `- Add: \`${fix.newPackage}@${fix.newVersion}\`\n\n`;
    } else if (fix.type === 'version_update' || fix.type === 'version_alignment') {
      documentation += `**Changes:**\n`;
      documentation += `- Update \`${fix.package}\` from \`${fix.currentVersion}\` to \`${fix.newVersion}\`\n\n`;
    }
    
    return documentation;
  }
} 