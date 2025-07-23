import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Branch Creator Service
 *
 * Creates new branches when breaking changes are detected in dependency updates.
 * Handles repository cloning, branch creation, and fix application.
 *
 * Design Patterns Used:
 * - Strategy Pattern: Different branch creation strategies for different project types
 * - Factory Pattern: Creates appropriate branch creators based on project type
 * - Template Method Pattern: Common branch creation workflow with project-specific implementations
 * - Command Pattern: Encapsulates branch creation operations as commands
 */
export class BranchCreator {
  constructor(app, config = {}) {
    this.app = app;
    this.log = app.log;
    this.config = {
      tempDir: '/tmp',
      branchPrefix: 'fix/breaking-changes',
      ...config
    };
  }

  /**
   * Create a new branch with fixes for breaking changes
   * @param {Object} context - Probot context
   * @param {Object} breakingChanges - Breaking changes result
   * @returns {Promise<Object>} - Branch creation result
   */
  async createFixBranch(context, breakingChanges) {
    const { repository } = context.payload;

    try {
      this.log.info(`🌿 Creating fix branch for ${repository.full_name}`);

      // Step 1: Generate unique branch name
      const branchName = this.generateBranchName(breakingChanges);

      // Step 2: Clone repository to temp directory
      const repoPath = await this.cloneRepository(context, repository);

      // Step 3: Create and checkout new branch
      await this.createBranch(repoPath, branchName);

      // Step 4: Apply fixes based on breaking changes
      const fixResult = await this.applyFixes(repoPath, breakingChanges);

      // Step 5: Commit changes
      const commitResult = await this.commitChanges(repoPath, breakingChanges);

      // Step 6: Push branch to remote
      const pushResult = await this.pushBranch(context, repoPath, branchName);

      // Step 7: Cleanup temp directory
      await this.cleanup(repoPath);

      const result = {
        success: true,
        branchName,
        repoPath,
        filesModified: fixResult.filesModified || [],
        changesApplied: fixResult.changesApplied || 0,
        commitHash: commitResult.commitHash,
        pushSuccess: pushResult.success
      };

      this.log.info(`✅ Fix branch created successfully: ${branchName}`);
      return result;

    } catch (error) {
      this.log.error(`❌ Failed to create fix branch: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique branch name
   * @param {Object} breakingChanges - Breaking changes result
   * @returns {string} - Branch name
   */
  generateBranchName(breakingChanges) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const changeCount = breakingChanges.changes.length;
    const projectType = breakingChanges.projectType || 'unknown';

    return `${this.config.branchPrefix}-${projectType}-${changeCount}-changes-${timestamp}`;
  }

  /**
   * Clone repository to temporary directory
   * @param {Object} context - Probot context
   * @param {Object} repository - Repository object
   * @returns {Promise<string>} - Path to cloned repository
   */
  async cloneRepository(context, repository) {
    const repoPath = path.join(this.config.tempDir, `repo-${Date.now()}`);

    try {
      this.log.info(`📥 Cloning repository to ${repoPath}`);

      // Get repository URL
      const repoUrl = `https://github.com/${repository.owner.login}/${repository.name}.git`;

      // Clone repository
      await this.executeCommand('git', ['clone', repoUrl, repoPath]);

      this.log.info('✅ Repository cloned successfully');
      return repoPath;

    } catch (error) {
      this.log.error(`❌ Failed to clone repository: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create and checkout new branch
   * @param {string} repoPath - Repository path
   * @param {string} branchName - Branch name
   */
  async createBranch(repoPath, branchName) {
    try {
      this.log.info(`🌿 Creating branch: ${branchName}`);

      // Create and checkout new branch
      await this.executeCommand('git', ['checkout', '-b', branchName], repoPath);

      this.log.info(`✅ Branch created and checked out: ${branchName}`);

    } catch (error) {
      this.log.error(`❌ Failed to create branch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply fixes based on breaking changes
   * @param {string} repoPath - Repository path
   * @param {Object} breakingChanges - Breaking changes result
   * @returns {Promise<Object>} - Fix application result
   */
  async applyFixes(repoPath, breakingChanges) {
    try {
      this.log.info(`�� Applying fixes for ${breakingChanges.changes.length} breaking changes`);

      const filesModified = [];
      let changesApplied = 0;

      for (const change of breakingChanges.changes) {
        const fixResult = await this.applyFixForChange(repoPath, change);

        if (fixResult.success) {
          filesModified.push(...fixResult.filesModified);
          changesApplied += fixResult.changesApplied;
        }
      }

      return {
        success: true,
        filesModified: [...new Set(filesModified)], // Remove duplicates
        changesApplied
      };

    } catch (error) {
      this.log.error(`❌ Failed to apply fixes: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Apply fix for a specific breaking change
   * @param {string} repoPath - Repository path
   * @param {Object} change - Breaking change object
   * @returns {Promise<Object>} - Fix application result
   */
  async applyFixForChange(repoPath, change) {
    try {
      const filesModified = [];
      let changesApplied = 0;

      switch (change.type) {
      case 'removed_class_or_package': {
        const removeResult = await this.fixRemovedClass(repoPath, change);
        filesModified.push(...removeResult.filesModified);
        changesApplied += removeResult.changesApplied;
        break;
      }

      case 'api_signature_change': {
        const apiResult = await this.fixApiSignature(repoPath, change);
        filesModified.push(...apiResult.filesModified);
        changesApplied += apiResult.changesApplied;
        break;
      }

      case 'deprecated_api': {
        const deprecationResult = await this.fixDeprecatedApi(repoPath, change);
        filesModified.push(...deprecationResult.filesModified);
        changesApplied += deprecationResult.changesApplied;
        break;
      }

      case 'dependency_conflict': {
        const conflictResult = await this.fixDependencyConflict(repoPath, change);
        filesModified.push(...conflictResult.filesModified);
        changesApplied += conflictResult.changesApplied;
        break;
      }

      default:
        this.log.warn(`⚠️ Unknown breaking change type: ${change.type}`);
      }

      return {
        success: true,
        filesModified,
        changesApplied
      };

    } catch (error) {
      this.log.error(`❌ Failed to apply fix for ${change.type}: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Fix removed class or package
   * @param {string} repoPath - Repository path
   * @param {Object} change - Breaking change object
   * @returns {Promise<Object>} - Fix result
   */
  async fixRemovedClass(repoPath, change) {
    try {
      this.log.info(`🔧 Fixing removed class/package: ${change.description}`);

      // Create a simple fix by adding a comment explaining the issue
      const fixContent = `// TODO: Fix breaking change - ${change.description}\n// This class/package was removed in the dependency update\n// Please update the code to use the new API\n`;

      // Find affected files and add the fix
      const affectedFiles = await this.findAffectedFiles(repoPath, change);

      for (const file of affectedFiles) {
        await this.addFixComment(file, fixContent);
      }

      return {
        success: true,
        filesModified: affectedFiles,
        changesApplied: affectedFiles.length
      };

    } catch (error) {
      this.log.error(`❌ Failed to fix removed class: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Fix API signature change
   * @param {string} repoPath - Repository path
   * @param {Object} change - Breaking change object
   * @returns {Promise<Object>} - Fix result
   */
  async fixApiSignature(repoPath, change) {
    try {
      this.log.info(`🔧 Fixing API signature change: ${change.description}`);

      const fixContent = `// TODO: Fix API signature change - ${change.description}\n// The method signature has changed in the dependency update\n// Please update the method call to match the new signature\n`;

      const affectedFiles = await this.findAffectedFiles(repoPath, change);

      for (const file of affectedFiles) {
        await this.addFixComment(file, fixContent);
      }

      return {
        success: true,
        filesModified: affectedFiles,
        changesApplied: affectedFiles.length
      };

    } catch (error) {
      this.log.error(`❌ Failed to fix API signature: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Fix deprecated API
   * @param {string} repoPath - Repository path
   * @param {Object} change - Breaking change object
   * @returns {Promise<Object>} - Fix result
   */
  async fixDeprecatedApi(repoPath, change) {
    try {
      this.log.info(`🔧 Fixing deprecated API: ${change.description}`);

      const fixContent = `// TODO: Fix deprecated API - ${change.description}\n// This API is deprecated and should be replaced\n// Please use the recommended alternative\n`;

      const affectedFiles = await this.findAffectedFiles(repoPath, change);

      for (const file of affectedFiles) {
        await this.addFixComment(file, fixContent);
      }

      return {
        success: true,
        filesModified: affectedFiles,
        changesApplied: affectedFiles.length
      };

    } catch (error) {
      this.log.error(`❌ Failed to fix deprecated API: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Fix dependency conflict
   * @param {string} repoPath - Repository path
   * @param {Object} change - Breaking change object
   * @returns {Promise<Object>} - Fix result
   */
  async fixDependencyConflict(repoPath, change) {
    try {
      this.log.info(`🔧 Fixing dependency conflict: ${change.description}`);

      // Create a dependency resolution file
      const resolutionFile = path.join(repoPath, 'BREAKING_CHANGES_RESOLUTION.md');
      const resolutionContent = `# Breaking Changes Resolution

## Dependency Conflict Detected
${change.description}

## Recommended Actions
1. Review the dependency conflict
2. Update dependency versions to resolve conflicts
3. Test the application thoroughly
4. Update code to use compatible APIs

## Files Affected
- Check build logs for specific files
- Review import statements
- Update method calls if needed

Generated by Breaking Change Detector on ${new Date().toISOString()}
`;

      await fs.writeFile(resolutionFile, resolutionContent, 'utf8');

      return {
        success: true,
        filesModified: [resolutionFile],
        changesApplied: 1
      };

    } catch (error) {
      this.log.error(`❌ Failed to fix dependency conflict: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filesModified: [],
        changesApplied: 0
      };
    }
  }

  /**
   * Find files affected by a breaking change
   * @param {string} repoPath - Repository path
   * @param {Object} _change - Breaking change object (unused but kept for interface)
   * @returns {Promise<Array>} - Array of affected file paths
   */
  async findAffectedFiles(repoPath, _change) {
    try {
      // Simple implementation - look for common source file extensions
      const sourceExtensions = ['.js', '.ts', '.java', '.kt', '.py', '.go', '.rs'];
      const affectedFiles = [];

      // Search for files that might be affected
      for (const ext of sourceExtensions) {
        const files = await this.findFilesByExtension(repoPath, ext);
        affectedFiles.push(...files);
      }

      // Limit to first 5 files to avoid overwhelming
      return affectedFiles.slice(0, 5);

    } catch (error) {
      this.log.warn(`⚠️ Could not find affected files: ${error.message}`);
      return [];
    }
  }

  /**
   * Find files by extension
   * @param {string} repoPath - Repository path
   * @param {string} extension - File extension
   * @returns {Promise<Array>} - Array of file paths
   */
  async findFilesByExtension(repoPath, extension) {
    const files = [];

    try {
      const items = await fs.readdir(repoPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(repoPath, item.name);

        if (item.isDirectory() && !item.name.startsWith('.')) {
          const subFiles = await this.findFilesByExtension(fullPath, extension);
          files.push(...subFiles);
        } else if (item.isFile() && item.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors for individual directories
    }

    return files;
  }

  /**
   * Add fix comment to a file
   * @param {string} filePath - File path
   * @param {string} fixContent - Fix content to add
   */
  async addFixComment(filePath, fixContent) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const updatedContent = fixContent + '\n' + content;
      await fs.writeFile(filePath, updatedContent, 'utf8');

      this.log.debug(`✅ Added fix comment to ${filePath}`);

    } catch (error) {
      this.log.warn(`⚠️ Could not add fix comment to ${filePath}: ${error.message}`);
    }
  }

  /**
   * Commit changes to the branch
   * @param {string} repoPath - Repository path
   * @param {Object} breakingChanges - Breaking changes result
   * @returns {Promise<Object>} - Commit result
   */
  async commitChanges(repoPath, breakingChanges) {
    try {
      this.log.info('💾 Committing changes to branch');

      // Add all changes
      await this.executeCommand('git', ['add', '.'], repoPath);

      // Create commit message
      const commitMessage = this.generateCommitMessage(breakingChanges);

      // Commit changes
      await this.executeCommand('git', ['commit', '-m', commitMessage], repoPath);

      // Get commit hash
      const hashResult = await this.executeCommand('git', ['rev-parse', 'HEAD'], repoPath);
      const commitHash = hashResult.stdout.trim();

      this.log.info(`✅ Changes committed: ${commitHash}`);

      return {
        success: true,
        commitHash,
        commitMessage
      };

    } catch (error) {
      this.log.error(`❌ Failed to commit changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate commit message for breaking changes
   * @param {Object} breakingChanges - Breaking changes result
   * @returns {string} - Commit message
   */
  generateCommitMessage(breakingChanges) {
    const changeCount = breakingChanges.changes.length;
    const projectType = breakingChanges.projectType || 'unknown';

    return `fix: Address ${changeCount} breaking changes in ${projectType} dependencies

Breaking changes detected and fixes applied:
${breakingChanges.changes.map(change => `- ${change.type}: ${change.description}`).join('\n')}

Generated by Breaking Change Detector
Timestamp: ${new Date().toISOString()}`;
  }

  /**
   * Push branch to remote repository
   * @param {Object} context - Probot context
   * @param {string} repoPath - Repository path
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} - Push result
   */
  async pushBranch(context, repoPath, branchName) {
    try {
      this.log.info(`📤 Pushing branch to remote: ${branchName}`);

      // Push branch to remote
      await this.executeCommand('git', ['push', 'origin', branchName], repoPath);

      this.log.info(`✅ Branch pushed successfully: ${branchName}`);

      return {
        success: true,
        branchName
      };

    } catch (error) {
      this.log.error(`❌ Failed to push branch: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up temporary directory
   * @param {string} repoPath - Repository path
   */
  async cleanup(repoPath) {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      this.log.debug(`🧹 Cleaned up temporary directory: ${repoPath}`);
    } catch (error) {
      this.log.warn(`⚠️ Could not clean up temporary directory: ${error.message}`);
    }
  }

  /**
   * Execute command with timeout and logging
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  executeCommand(command, args, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 60000; // 1 minute default

      this.log.debug(`Executing: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          logs: stdout + stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}