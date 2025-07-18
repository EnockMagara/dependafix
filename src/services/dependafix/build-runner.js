import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Build Runner - Handles build process execution for different build tools
 * 
 * Design Patterns Used:
 * - Strategy Pattern: Different build strategies for Maven, Gradle, etc.
 * - Factory Pattern: Creates appropriate build strategy based on detected tool
 * - Template Method Pattern: Common build workflow with tool-specific implementations
 */
export class BuildRunner {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = {
      buildTimeout: 300000, // 5 minutes
      maxRetries: 2,
      ...config
    };

    // Initialize build strategies
    this.buildStrategies = new Map([
      ['maven', new MavenBuildStrategy(context, this.config)],
      ['gradle', new GradleBuildStrategy(context, this.config)]
    ]);
  }

  /**
   * Detect build tool used in repository
   * @param {string} repoPath - Path to repository
   * @returns {Promise<string>} - Detected build tool
   */
  async detectBuildTool(repoPath) {
    try {
      this.log.info(`🔍 Detecting build tool in ${repoPath}`);

      // Check for Maven
      if (await this.fileExists(repoPath, 'pom.xml')) {
        this.log.info(`✅ Detected Maven build tool`);
        return 'maven';
      }

      // Check for Gradle
      const gradleFiles = ['build.gradle', 'build.gradle.kts', 'gradlew'];
      for (const file of gradleFiles) {
        if (await this.fileExists(repoPath, file)) {
          this.log.info(`✅ Detected Gradle build tool`);
          return 'gradle';
        }
      }

      throw new Error('No supported build tool detected (Maven or Gradle)');
    } catch (error) {
      this.log.error(`❌ Build tool detection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run build process
   * @param {string} repoPath - Path to repository
   * @param {string} buildTool - Build tool to use
   * @param {Object} options - Build options
   * @returns {Promise<Object>} - Build result
   */
  async runBuild(repoPath, buildTool, options = {}) {
    const strategy = this.buildStrategies.get(buildTool);
    if (!strategy) {
      throw new Error(`Unsupported build tool: ${buildTool}`);
    }

    try {
      this.log.info(`🔨 Running ${buildTool} build in ${repoPath}`);
      
      const result = await strategy.build(repoPath, options);
      
      if (result.success) {
        this.log.info(`✅ Build completed successfully`);
      } else {
        this.log.info(`❌ Build failed with ${result.errors.length} errors`);
      }

      return result;
    } catch (error) {
      this.log.error(`❌ Build execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run tests
   * @param {string} repoPath - Path to repository
   * @param {string} buildTool - Build tool to use
   * @param {Object} options - Test options
   * @returns {Promise<Object>} - Test result
   */
  async runTests(repoPath, buildTool, options = {}) {
    const strategy = this.buildStrategies.get(buildTool);
    if (!strategy) {
      throw new Error(`Unsupported build tool: ${buildTool}`);
    }

    try {
      this.log.info(`🧪 Running ${buildTool} tests in ${repoPath}`);
      
      const result = await strategy.test(repoPath, options);
      
      if (result.success) {
        this.log.info(`✅ Tests completed successfully`);
      } else {
        this.log.info(`❌ Tests failed with ${result.failures.length} failures`);
      }

      return result;
    } catch (error) {
      this.log.error(`❌ Test execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get dependency information
   * @param {string} repoPath - Path to repository
   * @param {string} buildTool - Build tool to use
   * @returns {Promise<Object>} - Dependency information
   */
  async getDependencyInfo(repoPath, buildTool) {
    const strategy = this.buildStrategies.get(buildTool);
    if (!strategy) {
      throw new Error(`Unsupported build tool: ${buildTool}`);
    }

    try {
      this.log.info(`📋 Getting dependency info for ${buildTool}`);
      
      const depInfo = await strategy.getDependencyInfo(repoPath);
      
      this.log.info(`✅ Found ${depInfo.dependencies.length} dependencies`);
      return depInfo;
    } catch (error) {
      this.log.error(`❌ Dependency info retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file exists
   * @param {string} repoPath - Repository path
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} - True if file exists
   */
  async fileExists(repoPath, filePath) {
    try {
      await fs.access(path.join(repoPath, filePath));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Base class for build strategies
 */
class BuildStrategy {
  constructor(context, config) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Execute command with timeout and logging
   * @param {string} command - Command to execute
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result
   */
  async executeCommand(command, args, cwd, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.buildTimeout;
      
      this.log.debug(`Executing: ${command} ${args.join(' ')}`);

      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (timedOut) {
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }

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

/**
 * Maven build strategy
 */
class MavenBuildStrategy extends BuildStrategy {
  async build(repoPath, options = {}) {
    try {
      const goals = options.goals || ['clean', 'compile'];
      const result = await this.executeCommand('mvn', goals, repoPath, options);
      
      return {
        success: result.success,
        buildTool: 'maven',
        logs: result.logs,
        errors: result.success ? [] : this.parseErrors(result.logs),
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        success: false,
        buildTool: 'maven',
        logs: error.message,
        errors: [{ type: 'execution_error', message: error.message }],
        exitCode: -1
      };
    }
  }

  async test(repoPath, options = {}) {
    try {
      const goals = options.goals || ['test'];
      const result = await this.executeCommand('mvn', goals, repoPath, options);
      
      return {
        success: result.success,
        buildTool: 'maven',
        logs: result.logs,
        failures: result.success ? [] : this.parseTestFailures(result.logs),
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        success: false,
        buildTool: 'maven',
        logs: error.message,
        failures: [{ type: 'execution_error', message: error.message }],
        exitCode: -1
      };
    }
  }

  async getDependencyInfo(repoPath) {
    try {
      const result = await this.executeCommand('mvn', ['dependency:tree', '-DoutputType=json'], repoPath);
      
      return {
        buildTool: 'maven',
        dependencies: this.parseMavenDependencies(result.stdout),
        rawOutput: result.stdout
      };
    } catch (error) {
      this.log.warn(`Failed to get Maven dependency info: ${error.message}`);
      return {
        buildTool: 'maven',
        dependencies: [],
        rawOutput: error.message
      };
    }
  }

  parseErrors(logs) {
    const errors = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (line.includes('[ERROR]')) {
        errors.push({
          type: 'compile_error',
          message: line.replace('[ERROR]', '').trim(),
          line: line
        });
      }
    }
    
    return errors;
  }

  parseTestFailures(logs) {
    const failures = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (line.includes('FAILED') || line.includes('ERROR')) {
        failures.push({
          type: 'test_failure',
          message: line.trim(),
          line: line
        });
      }
    }
    
    return failures;
  }

  parseMavenDependencies(output) {
    try {
      // Parse Maven dependency tree output
      const dependencies = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes(':')) {
          const parts = line.trim().split(':');
          if (parts.length >= 4) {
            dependencies.push({
              groupId: parts[0],
              artifactId: parts[1],
              version: parts[3],
              scope: parts[4] || 'compile'
            });
          }
        }
      }
      
      return dependencies;
    } catch (error) {
      this.log.warn(`Failed to parse Maven dependencies: ${error.message}`);
      return [];
    }
  }
}

/**
 * Gradle build strategy
 */
class GradleBuildStrategy extends BuildStrategy {
  async build(repoPath, options = {}) {
    try {
      const tasks = options.tasks || ['clean', 'build'];
      const gradleCommand = await this.getGradleCommand(repoPath);
      
      const result = await this.executeCommand(gradleCommand, tasks, repoPath, options);
      
      return {
        success: result.success,
        buildTool: 'gradle',
        logs: result.logs,
        errors: result.success ? [] : this.parseErrors(result.logs),
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        success: false,
        buildTool: 'gradle',
        logs: error.message,
        errors: [{ type: 'execution_error', message: error.message }],
        exitCode: -1
      };
    }
  }

  async test(repoPath, options = {}) {
    try {
      const tasks = options.tasks || ['test'];
      const gradleCommand = await this.getGradleCommand(repoPath);
      
      const result = await this.executeCommand(gradleCommand, tasks, repoPath, options);
      
      return {
        success: result.success,
        buildTool: 'gradle',
        logs: result.logs,
        failures: result.success ? [] : this.parseTestFailures(result.logs),
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        success: false,
        buildTool: 'gradle',
        logs: error.message,
        failures: [{ type: 'execution_error', message: error.message }],
        exitCode: -1
      };
    }
  }

  async getDependencyInfo(repoPath) {
    try {
      const gradleCommand = await this.getGradleCommand(repoPath);
      const result = await this.executeCommand(gradleCommand, ['dependencies'], repoPath);
      
      return {
        buildTool: 'gradle',
        dependencies: this.parseGradleDependencies(result.stdout),
        rawOutput: result.stdout
      };
    } catch (error) {
      this.log.warn(`Failed to get Gradle dependency info: ${error.message}`);
      return {
        buildTool: 'gradle',
        dependencies: [],
        rawOutput: error.message
      };
    }
  }

  async getGradleCommand(repoPath) {
    // Check if gradlew exists
    try {
      await fs.access(path.join(repoPath, 'gradlew'));
      return './gradlew';
    } catch {
      return 'gradle';
    }
  }

  parseErrors(logs) {
    const errors = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (line.includes('FAILED') || line.includes('ERROR')) {
        errors.push({
          type: 'compile_error',
          message: line.trim(),
          line: line
        });
      }
    }
    
    return errors;
  }

  parseTestFailures(logs) {
    const failures = [];
    const lines = logs.split('\n');
    
    for (const line of lines) {
      if (line.includes('FAILED') || line.includes('ERROR')) {
        failures.push({
          type: 'test_failure',
          message: line.trim(),
          line: line
        });
      }
    }
    
    return failures;
  }

  parseGradleDependencies(output) {
    try {
      const dependencies = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        // Parse Gradle dependency format: group:name:version
        const match = line.match(/([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+)/);
        if (match) {
          dependencies.push({
            groupId: match[1],
            artifactId: match[2],
            version: match[3],
            scope: this.extractScope(line)
          });
        }
      }
      
      return dependencies;
    } catch (error) {
      this.log.warn(`Failed to parse Gradle dependencies: ${error.message}`);
      return [];
    }
  }

  extractScope(line) {
    if (line.includes('implementation')) return 'implementation';
    if (line.includes('testImplementation')) return 'testImplementation';
    if (line.includes('api')) return 'api';
    if (line.includes('compileOnly')) return 'compileOnly';
    return 'compile';
  }
} 