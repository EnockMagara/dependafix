import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Service for checking out repositories and performing local analysis
 */
export class RepositoryChecker {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    this.tempDir = null;
  }

  /**
   * Checkout repository to a temporary directory
   * @param {string} commitSha - Commit SHA to checkout
   * @returns {Object} - Checkout result
   */
  async checkoutRepository(commitSha) {
    const { repository } = this.context.payload;
    
    try {
      // Create temporary directory
      this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dependafix-'));
      this.log.info(`📁 Created temporary directory: ${this.tempDir}`);

      // Clone repository
      const cloneResult = await this.cloneRepository(repository, this.tempDir);
      if (!cloneResult.success) {
        return cloneResult;
      }

      // Checkout specific commit
      const checkoutResult = await this.checkoutCommit(commitSha);
      if (!checkoutResult.success) {
        return checkoutResult;
      }

      // Verify pom.xml exists
      const pomExists = await this.verifyPomXmlExists();
      if (!pomExists) {
        return {
          success: false,
          error: 'pom.xml not found in repository',
          path: this.tempDir
        };
      }

      this.log.info(`✅ Repository checked out successfully to ${this.tempDir}`);
      
      return {
        success: true,
        path: this.tempDir,
        commitSha,
        repository: repository.full_name
      };

    } catch (error) {
      this.log.error(`❌ Error checking out repository: ${error.message}`);
      return {
        success: false,
        error: error.message,
        path: this.tempDir
      };
    }
  }

  /**
   * Clone repository to local directory
   * @param {Object} repository - Repository information
   * @param {string} targetDir - Target directory
   * @returns {Object} - Clone result
   */
  async cloneRepository(repository, targetDir) {
    try {
      // Get repository clone URL
      const cloneUrl = repository.clone_url;
      
      // Clone with depth 1 for faster checkout
      const { stdout, stderr } = await execAsync(
        `git clone --depth 1 ${cloneUrl} ${targetDir}`,
        { timeout: 60000 } // 60 second timeout
      );

      if (stderr && !stderr.includes('Cloning into')) {
        this.log.warn(`Git clone warnings: ${stderr}`);
      }

      this.log.info(`📥 Repository cloned successfully`);
      return { success: true };

    } catch (error) {
      this.log.error(`❌ Failed to clone repository: ${error.message}`);
      return {
        success: false,
        error: `Clone failed: ${error.message}`
      };
    }
  }

  /**
   * Checkout specific commit
   * @param {string} commitSha - Commit SHA to checkout
   * @returns {Object} - Checkout result
   */
  async checkoutCommit(commitSha) {
    try {
      // Fetch the specific commit
      const { stdout, stderr } = await execAsync(
        `git fetch origin ${commitSha}`,
        { cwd: this.tempDir, timeout: 30000 }
      );

      if (stderr && !stderr.includes('From')) {
        this.log.warn(`Git fetch warnings: ${stderr}`);
      }

      // Checkout the commit
      await execAsync(
        `git checkout ${commitSha}`,
        { cwd: this.tempDir, timeout: 30000 }
      );

      this.log.info(`✅ Checked out commit: ${commitSha.substring(0, 8)}`);
      return { success: true };

    } catch (error) {
      this.log.error(`❌ Failed to checkout commit: ${error.message}`);
      return {
        success: false,
        error: `Checkout failed: ${error.message}`
      };
    }
  }

  /**
   * Verify pom.xml exists in the repository
   * @returns {boolean} - True if pom.xml exists
   */
  async verifyPomXmlExists() {
    try {
      const pomPath = path.join(this.tempDir, 'pom.xml');
      await fs.access(pomPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute Maven build in the checked out repository
   * @param {Object} options - Build options
   * @returns {Object} - Build result
   */
  async executeMavenBuild(options = {}) {
    if (!this.tempDir) {
      return {
        success: false,
        error: 'Repository not checked out'
      };
    }

    try {
      const buildCommand = this.buildMavenCommand(options);
      this.log.info(`🔨 Executing Maven build: ${buildCommand}`);

      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: this.tempDir,
        timeout: 300000, // 5 minute timeout
        env: {
          ...process.env,
          MAVEN_OPTS: '-Xmx2g -XX:MaxPermSize=512m'
        }
      });

      const buildResult = {
        success: true,
        stdout,
        stderr,
        logs: stdout + stderr,
        failures: this.extractBuildFailures(stdout + stderr)
      };

      if (buildResult.failures.length > 0) {
        buildResult.success = false;
      }

      this.log.info(`✅ Maven build ${buildResult.success ? 'succeeded' : 'failed'}`);
      return buildResult;

    } catch (error) {
      this.log.error(`❌ Maven build failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        logs: error.stdout + error.stderr,
        failures: this.extractBuildFailures(error.stdout + error.stderr)
      };
    }
  }

  /**
   * Build Maven command based on options
   * @param {Object} options - Build options
   * @returns {string} - Maven command
   */
  buildMavenCommand(options) {
    const { skipTests = false, clean = true, compileOnly = false } = options;
    
    let command = 'mvn';
    
    if (clean) {
      command += ' clean';
    }
    
    if (compileOnly) {
      command += ' compile';
    } else {
      command += ' compile test-compile';
    }
    
    if (skipTests) {
      command += ' -DskipTests';
    }
    
    return command;
  }

  /**
   * Extract build failures from Maven output
   * @param {string} output - Maven build output
   * @returns {Array} - Array of build failures
   */
  extractBuildFailures(output) {
    const failures = [];
    
    if (!output) {
      return failures;
    }

    // Maven compilation errors
    const mavenErrorRegex = /\[ERROR\] (.*?\.java):\[(\d+),(\d+)\] (.*)/g;
    let match;
    
    while ((match = mavenErrorRegex.exec(output)) !== null) {
      failures.push({
        type: 'compilation_error',
        message: match[4].trim(),
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        confidence: 95,
        severity: 'high'
      });
    }

    // Dependency resolution errors
    const dependencyErrorRegex = /Could not resolve dependencies|Could not find artifact|No versions available/g;
    if (dependencyErrorRegex.test(output)) {
      failures.push({
        type: 'dependency_resolution_error',
        message: 'Dependency resolution failed',
        file: 'pom.xml',
        line: 0,
        confidence: 85,
        severity: 'high'
      });
    }

    // Build failures
    if (output.includes('BUILD FAILURE') || output.includes('BUILD FAILED')) {
      failures.push({
        type: 'build_failure',
        message: 'Build failed due to compilation errors',
        file: 'build',
        line: 0,
        confidence: 90,
        severity: 'high'
      });
    }

    return failures;
  }

  /**
   * Analyze pom.xml file in the checked out repository
   * @returns {Object} - pom.xml analysis result
   */
  async analyzePomXml() {
    if (!this.tempDir) {
      return {
        success: false,
        error: 'Repository not checked out'
      };
    }

    try {
      const pomPath = path.join(this.tempDir, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf-8');
      
      // Parse pom.xml (simplified parsing)
      const analysis = this.parsePomXml(pomContent);
      
      return {
        success: true,
        content: pomContent,
        analysis,
        path: pomPath
      };

    } catch (error) {
      this.log.error(`❌ Error analyzing pom.xml: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse pom.xml content
   * @param {string} content - pom.xml content
   * @returns {Object} - Parsed pom.xml information
   */
  parsePomXml(content) {
    const analysis = {
      dependencies: [],
      plugins: [],
      properties: {},
      javaVersion: null,
      buildTool: 'maven'
    };

    try {
      // Extract dependencies
      const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
      let match;
      
      while ((match = dependencyRegex.exec(content)) !== null) {
        const dependencyBlock = match[1];
        const dependency = this.extractDependencyInfo(dependencyBlock);
        if (dependency) {
          analysis.dependencies.push(dependency);
        }
      }

      // Extract plugins
      const pluginRegex = /<plugin>([\s\S]*?)<\/plugin>/g;
      
      while ((match = pluginRegex.exec(content)) !== null) {
        const pluginBlock = match[1];
        const plugin = this.extractPluginInfo(pluginBlock);
        if (plugin) {
          analysis.plugins.push(plugin);
        }
      }

      // Extract properties
      const propertyRegex = /<([^>]+)>(.*?)<\/[^>]+>/g;
      
      while ((match = propertyRegex.exec(content)) !== null) {
        const tag = match[1];
        const value = match[2].trim();
        
        if (tag.includes('java.version') || tag.includes('maven.compiler.source')) {
          analysis.javaVersion = value;
        }
        
        if (!tag.includes('/') && !tag.includes('?') && value && !value.includes('<')) {
          analysis.properties[tag] = value;
        }
      }

    } catch (error) {
      this.log.warn(`Error parsing pom.xml: ${error.message}`);
    }

    return analysis;
  }

  /**
   * Extract dependency information from dependency block
   * @param {string} dependencyBlock - Dependency XML block
   * @returns {Object|null} - Dependency information
   */
  extractDependencyInfo(dependencyBlock) {
    try {
      const groupIdMatch = dependencyBlock.match(/<groupId>(.*?)<\/groupId>/);
      const artifactIdMatch = dependencyBlock.match(/<artifactId>(.*?)<\/artifactId>/);
      const versionMatch = dependencyBlock.match(/<version>(.*?)<\/version>/);
      const scopeMatch = dependencyBlock.match(/<scope>(.*?)<\/scope>/);

      if (groupIdMatch && artifactIdMatch) {
        return {
          groupId: groupIdMatch[1].trim(),
          artifactId: artifactIdMatch[1].trim(),
          version: versionMatch ? versionMatch[1].trim() : null,
          scope: scopeMatch ? scopeMatch[1].trim() : 'compile'
        };
      }
    } catch (error) {
      this.log.warn(`Error extracting dependency info: ${error.message}`);
    }

    return null;
  }

  /**
   * Extract plugin information from plugin block
   * @param {string} pluginBlock - Plugin XML block
   * @returns {Object|null} - Plugin information
   */
  extractPluginInfo(pluginBlock) {
    try {
      const groupIdMatch = pluginBlock.match(/<groupId>(.*?)<\/groupId>/);
      const artifactIdMatch = pluginBlock.match(/<artifactId>(.*?)<\/artifactId>/);
      const versionMatch = pluginBlock.match(/<version>(.*?)<\/version>/);

      if (artifactIdMatch) {
        return {
          groupId: groupIdMatch ? groupIdMatch[1].trim() : 'org.apache.maven.plugins',
          artifactId: artifactIdMatch[1].trim(),
          version: versionMatch ? versionMatch[1].trim() : null
        };
      }
    } catch (error) {
      this.log.warn(`Error extracting plugin info: ${error.message}`);
    }

    return null;
  }

  /**
   * Clean up temporary directory
   */
  async cleanup() {
    if (this.tempDir) {
      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
        this.log.info(`🧹 Cleaned up temporary directory: ${this.tempDir}`);
        this.tempDir = null;
      } catch (error) {
        this.log.warn(`⚠️ Failed to cleanup temporary directory: ${error.message}`);
      }
    }
  }

  /**
   * Get file content from checked out repository
   * @param {string} filePath - File path relative to repository root
   * @returns {string|null} - File content or null
   */
  async getFileContent(filePath) {
    if (!this.tempDir) {
      return null;
    }

    try {
      const fullPath = path.join(this.tempDir, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      this.log.warn(`Could not read file ${filePath}: ${error.message}`);
      return null;
    }
  }
}
