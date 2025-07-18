import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Repository Manager - Handles Git operations and repository management
 * 
 * Design Patterns Used:
 * - Repository Pattern: Abstracts data access and Git operations
 * - Factory Pattern: Creates different repository handlers
 * - Template Method Pattern: Common workflow for different Git operations
 */
export class RepositoryManager {
  constructor(context) {
    this.context = context;
    this.log = context.log;
    this.octokit = context.octokit;
    this.workspaceRoot = path.join(os.tmpdir(), 'dependafix-workspace');
    this.activeRepositories = new Map();
  }

  /**
   * Checkout repository for processing
   * @param {Object} repository - Repository information
   * @param {Object} pr - Pull request (optional)
   * @returns {Promise<string>} - Path to checked out repository
   */
  async checkoutRepository(repository, pr = null) {
    const repoId = `${repository.owner.login}-${repository.name}`;
    const timestamp = Date.now();
    const repoPath = path.join(this.workspaceRoot, `${repoId}-${timestamp}`);

    try {
      // Ensure workspace directory exists
      await fs.mkdir(this.workspaceRoot, { recursive: true });

      this.log.info(`📁 Cloning repository ${repository.full_name} to ${repoPath}`);

      // Clone repository
      const cloneUrl = repository.clone_url;
      await this.executeGitCommand(['clone', cloneUrl, repoPath]);

      // If processing a PR, checkout the PR branch
      if (pr) {
        await this.checkoutPullRequest(repoPath, pr);
      }

      // Store active repository info
      this.activeRepositories.set(repoId, {
        path: repoPath,
        repository,
        pr,
        timestamp
      });

      this.log.info(`✅ Repository checked out successfully`);
      return repoPath;

    } catch (error) {
      this.log.error(`❌ Failed to checkout repository: ${error.message}`);
      throw new Error(`Repository checkout failed: ${error.message}`);
    }
  }

  /**
   * Checkout specific pull request branch
   * @param {string} repoPath - Path to repository
   * @param {Object} pr - Pull request object
   */
  async checkoutPullRequest(repoPath, pr) {
    try {
      this.log.info(`🔄 Checking out PR #${pr.number} branch: ${pr.head.ref}`);

      // Fetch PR branch
      await this.executeGitCommand([
        'fetch', 'origin', `pull/${pr.number}/head:pr-${pr.number}`
      ], repoPath);

      // Checkout PR branch
      await this.executeGitCommand(['checkout', `pr-${pr.number}`], repoPath);

      this.log.info(`✅ PR branch checked out successfully`);
    } catch (error) {
      this.log.error(`❌ Failed to checkout PR branch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new branch for fixes
   * @param {string} repoPath - Path to repository
   * @param {string} branchName - Name of the new branch
   * @returns {Promise<string>} - Created branch name
   */
  async createFixBranch(repoPath, branchName) {
    try {
      this.log.info(`🌿 Creating fix branch: ${branchName}`);

      // Create and checkout new branch
      await this.executeGitCommand(['checkout', '-b', branchName], repoPath);

      this.log.info(`✅ Fix branch created successfully`);
      return branchName;
    } catch (error) {
      this.log.error(`❌ Failed to create fix branch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Commit changes to repository
   * @param {string} repoPath - Path to repository
   * @param {string} message - Commit message
   * @param {Array<string>} files - Files to commit (optional)
   * @returns {Promise<string>} - Commit hash
   */
  async commitChanges(repoPath, message, files = []) {
    try {
      this.log.info(`📝 Committing changes: ${message}`);

      // Add files
      if (files.length > 0) {
        for (const file of files) {
          await this.executeGitCommand(['add', file], repoPath);
        }
      } else {
        await this.executeGitCommand(['add', '.'], repoPath);
      }

      // Check if there are changes to commit
      const status = await this.executeGitCommand(['status', '--porcelain'], repoPath);
      if (!status.trim()) {
        this.log.info(`No changes to commit`);
        return null;
      }

      // Commit changes
      await this.executeGitCommand(['commit', '-m', message], repoPath);

      // Get commit hash
      const commitHash = await this.executeGitCommand(['rev-parse', 'HEAD'], repoPath);

      this.log.info(`✅ Changes committed successfully: ${commitHash.trim()}`);
      return commitHash.trim();
    } catch (error) {
      this.log.error(`❌ Failed to commit changes: ${error.message}`);
      throw error;
    }
  }

  /**
   * Push branch to remote repository
   * @param {string} repoPath - Path to repository
   * @param {string} branchName - Branch to push
   * @returns {Promise<void>}
   */
  async pushBranch(repoPath, branchName) {
    try {
      this.log.info(`🚀 Pushing branch: ${branchName}`);

      // Push branch to origin
      await this.executeGitCommand(['push', 'origin', branchName], repoPath);

      this.log.info(`✅ Branch pushed successfully`);
    } catch (error) {
      this.log.error(`❌ Failed to push branch: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get repository information
   * @param {string} repoPath - Path to repository
   * @returns {Promise<Object>} - Repository information
   */
  async getRepositoryInfo(repoPath) {
    try {
      const remoteUrl = await this.executeGitCommand(['config', '--get', 'remote.origin.url'], repoPath);
      const currentBranch = await this.executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
      const lastCommit = await this.executeGitCommand(['rev-parse', 'HEAD'], repoPath);

      return {
        remoteUrl: remoteUrl.trim(),
        currentBranch: currentBranch.trim(),
        lastCommit: lastCommit.trim()
      };
    } catch (error) {
      this.log.error(`❌ Failed to get repository info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file content from repository
   * @param {string} repoPath - Path to repository
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} - File content
   */
  async getFileContent(repoPath, filePath) {
    try {
      const fullPath = path.join(repoPath, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      this.log.error(`❌ Failed to read file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write file content to repository
   * @param {string} repoPath - Path to repository
   * @param {string} filePath - Path to file
   * @param {string} content - File content
   * @returns {Promise<void>}
   */
  async writeFileContent(repoPath, filePath, content) {
    try {
      const fullPath = path.join(repoPath, filePath);
      const dir = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(fullPath, content, 'utf8');
      this.log.info(`✅ File written: ${filePath}`);
    } catch (error) {
      this.log.error(`❌ Failed to write file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file exists in repository
   * @param {string} repoPath - Path to repository
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} - True if file exists
   */
  async fileExists(repoPath, filePath) {
    try {
      const fullPath = path.join(repoPath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in repository directory
   * @param {string} repoPath - Path to repository
   * @param {string} dirPath - Directory path (optional)
   * @returns {Promise<Array<string>>} - List of files
   */
  async listFiles(repoPath, dirPath = '') {
    try {
      const fullPath = path.join(repoPath, dirPath);
      const files = await fs.readdir(fullPath);
      return files;
    } catch (error) {
      this.log.error(`❌ Failed to list files in ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup repository workspace
   * @param {string} processingId - Processing ID or repository ID
   * @returns {Promise<void>}
   */
  async cleanup(processingId) {
    try {
      // Find repositories to cleanup
      const toCleanup = [];
      
      for (const [repoId, info] of this.activeRepositories.entries()) {
        if (repoId.includes(processingId) || Date.now() - info.timestamp > 3600000) { // 1 hour
          toCleanup.push({ repoId, info });
        }
      }

      for (const { repoId, info } of toCleanup) {
        this.log.info(`🧹 Cleaning up repository: ${repoId}`);
        
        try {
          await fs.rm(info.path, { recursive: true, force: true });
          this.activeRepositories.delete(repoId);
          this.log.info(`✅ Repository cleaned up: ${repoId}`);
        } catch (error) {
          this.log.warn(`⚠️ Failed to cleanup ${repoId}: ${error.message}`);
        }
      }
    } catch (error) {
      this.log.error(`❌ Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Execute Git command
   * @param {Array<string>} args - Git command arguments
   * @param {string} cwd - Working directory (optional)
   * @returns {Promise<string>} - Command output
   */
  async executeGitCommand(args, cwd = null) {
    return new Promise((resolve, reject) => {
      const command = 'git';
      const options = {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      };

      this.log.debug(`Executing: git ${args.join(' ')}`);

      const child = spawn(command, args, options);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Git command failed: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }
} 