/**
 * Enhanced Build Executor Service
 * Implements dual-strategy approach: CI/CD output analysis + automated build execution
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export class EnhancedBuildExecutor {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    this.tempDir = null;
  }

  /**
   * Main build execution with dual strategy
   * @param {string} buildTool - 'maven' or 'gradle'
   * @param {Object} options - Build options
   * @returns {Object} - Build result with compilation errors
   */
  async executeBuild(buildTool, options = {}) {
    const { repository } = this.context.payload;
    this.log.info(`🔨 Executing enhanced build for ${repository.full_name}`);
    
    const buildResult = {
      success: false,
      buildTime: 0,
      logs: '',
      failures: [],
      javaVersion: null,
      buildTool,
      strategy: 'unknown'
    };

    try {
      const startTime = Date.now();
      
      // Strategy 1: Try to get CI/CD output first
      const ciCdResult = await this.tryGetCiCdOutput();
      
      if (ciCdResult && ciCdResult.available) {
        this.log.info('📋 Using CI/CD output for compilation error detection');
        buildResult.strategy = 'ci_cd';
        buildResult.success = ciCdResult.success;
        buildResult.logs = ciCdResult.logs;
        buildResult.failures = ciCdResult.failures;
        buildResult.javaVersion = ciCdResult.javaVersion;
      } else {
        // Strategy 2: Automated repository checkout and build
        this.log.info('🔧 CI/CD not available, executing automated build');
        buildResult.strategy = 'automated_build';
        
        const automatedResult = await this.executeAutomatedBuild(buildTool, options);
        buildResult.success = automatedResult.success;
        buildResult.logs = automatedResult.logs;
        buildResult.failures = automatedResult.failures;
        buildResult.javaVersion = automatedResult.javaVersion;
      }
      
      buildResult.buildTime = Date.now() - startTime;
      
      this.log.info(`✅ Build ${buildResult.success ? 'succeeded' : 'failed'} using ${buildResult.strategy} strategy`);
      
    } catch (error) {
      this.log.error(`❌ Enhanced build execution failed: ${error.message}`);
      buildResult.logs = `Build execution error: ${error.message}`;
      buildResult.failures.push({
        type: 'build_execution_error',
        message: error.message,
        file: 'build',
        line: 0,
        confidence: 100
      });
    } finally {
      // Cleanup temporary directory
      await this.cleanup();
    }

    return buildResult;
  }

  /**
   * Strategy 1: Try to get CI/CD output from GitHub Actions
   * @returns {Object|null} - CI/CD result or null if not available
   */
  async tryGetCiCdOutput() {
    const { repository } = this.context.payload;
    
    try {
      // Get recent workflow runs
      const workflowRuns = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10,
        status: 'completed'
      });

      if (workflowRuns.data.workflow_runs.length === 0) {
        return { available: false };
      }

      // Find the most recent relevant workflow run
      const relevantRun = this.findRelevantWorkflowRun(workflowRuns.data.workflow_runs);
      
      if (!relevantRun) {
        return { available: false };
      }

      // Get workflow run logs
      const logsResponse = await this.octokit.rest.actions.downloadWorkflowRunLogs({
        owner: repository.owner.login,
        repo: repository.name,
        run_id: relevantRun.id
      });

      if (logsResponse.data) {
        const logs = logsResponse.data;
        const failures = this.parseCompilationErrors(logs);
        
        return {
          available: true,
          success: relevantRun.conclusion === 'success',
          logs: logs,
          failures: failures,
          javaVersion: this.extractJavaVersion(logs),
          workflowRun: relevantRun
        };
      }

      return { available: false };
    } catch (error) {
      this.log.warn(`Could not get CI/CD output: ${error.message}`);
      return { available: false };
    }
  }

  /**
   * Strategy 2: Automated repository checkout and build execution
   * @param {string} buildTool - 'maven' or 'gradle'
   * @param {Object} options - Build options
   * @returns {Object} - Build result
   */
  async executeAutomatedBuild(buildTool, options = {}) {
    const { repository } = this.context.payload;
    
    try {
      // Create temporary directory
      this.tempDir = await this.createTempDirectory();
      this.log.info(`📁 Created temporary directory: ${this.tempDir}`);
      
      // Clone repository
      const cloneResult = await this.cloneRepository(repository, options.commitSha);
      if (!cloneResult.success) {
        throw new Error(`Repository clone failed: ${cloneResult.error}`);
      }
      
      // Execute build
      const buildResult = await this.runBuild(buildTool, options);
      
      return buildResult;
      
    } catch (error) {
      this.log.error(`Automated build failed: ${error.message}`);
      return {
        success: false,
        logs: `Automated build error: ${error.message}`,
        failures: [{
          type: 'automated_build_error',
          message: error.message,
          file: 'build',
          line: 0,
          confidence: 100
        }],
        javaVersion: null
      };
    }
  }

  /**
   * Create temporary directory for build
   * @returns {string} - Path to temporary directory
   */
  async createTempDirectory() {
    const tempPath = join(tmpdir(), `dependafix-build-${Date.now()}`);
    await mkdir(tempPath, { recursive: true });
    return tempPath;
  }

  /**
   * Clone repository to temporary directory
   * @param {Object} repository - Repository information
   * @param {string} commitSha - Specific commit to checkout
   * @returns {Object} - Clone result
   */
  async cloneRepository(repository, commitSha = null) {
    try {
      const cloneUrl = repository.clone_url;
      const repoPath = join(this.tempDir, repository.name);
      
      // Shallow clone for performance
      let cloneCommand = `git clone --depth 1 ${cloneUrl} ${repoPath}`;
      
      if (commitSha) {
        // If specific commit is provided, clone and checkout
        cloneCommand = `git clone ${cloneUrl} ${repoPath} && cd ${repoPath} && git checkout ${commitSha}`;
      }
      
      const { stdout, stderr } = await execAsync(cloneCommand, { 
        cwd: this.tempDir,
        timeout: 60000 // 60 second timeout
      });
      
      this.log.info(`✅ Repository cloned successfully to ${repoPath}`);
      
      return {
        success: true,
        repoPath: repoPath,
        stdout: stdout,
        stderr: stderr
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run the actual build command
   * @param {string} buildTool - 'maven' or 'gradle'
   * @param {Object} options - Build options
   * @returns {Object} - Build result
   */
  async runBuild(buildTool, options = {}) {
    const repoPath = join(this.tempDir, this.context.payload.repository.name);
    
    try {
      let buildCommand;
      let timeout = 300000; // 5 minutes default
      
      if (buildTool === 'maven') {
        buildCommand = 'mvn clean compile test-compile';
        if (options.skipTests) {
          buildCommand = 'mvn clean compile -DskipTests';
        }
      } else if (buildTool === 'gradle') {
        buildCommand = 'gradle compileJava compileTestJava';
        if (options.skipTests) {
          buildCommand = 'gradle compileJava -x test';
        }
      } else {
        throw new Error(`Unsupported build tool: ${buildTool}`);
      }
      
      this.log.info(`🔨 Executing build command: ${buildCommand}`);
      
      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: repoPath,
        timeout: timeout,
        env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME }
      });
      
      const fullOutput = stdout + '\n' + stderr;
      let failures = this.parseCompilationErrors(fullOutput);
      
      // If Maven fails due to dependencies, try direct Java compilation to catch syntax errors
      if (buildTool === 'maven' && failures.some(f => f.type === 'dependency_error')) {
        this.log.info(`🔍 Maven failed due to dependencies, attempting direct Java compilation to catch syntax errors`);
        const javaErrors = await this.runDirectJavaCompilation(repoPath);
        failures.push(...javaErrors);
      }
      
      return {
        success: failures.length === 0,
        logs: fullOutput,
        failures: failures,
        javaVersion: this.extractJavaVersion(fullOutput)
      };
      
    } catch (error) {
      // Build failed, but we can still extract errors from the output
      const buildOutput = error.stdout + '\n' + error.stderr;
      let failures = this.parseCompilationErrors(buildOutput);
      
      // If Maven fails due to dependencies, try direct Java compilation
      if (buildTool === 'maven' && failures.some(f => f.type === 'dependency_error')) {
        this.log.info(`🔍 Maven failed due to dependencies, attempting direct Java compilation to catch syntax errors`);
        const javaErrors = await this.runDirectJavaCompilation(repoPath);
        failures.push(...javaErrors);
      }
      
      return {
        success: false,
        logs: buildOutput,
        failures: failures,
        javaVersion: this.extractJavaVersion(buildOutput)
      };
    }
  }

  /**
   * Run direct Java compilation to catch syntax errors when Maven fails due to dependencies
   * @param {string} repoPath - Repository path
   * @returns {Array} - Array of Java compilation errors
   */
  async runDirectJavaCompilation(repoPath) {
    const errors = [];
    
    try {
      // Try to compile main Java files
      const mainJavaPath = join(repoPath, 'src', 'main', 'java');
      const testJavaPath = join(repoPath, 'src', 'test', 'java');
      
      // Check if main Java directory exists
      try {
        const mainJavaFiles = await this.findJavaFiles(mainJavaPath);
        if (mainJavaFiles.length > 0) {
          const mainCompileCommand = `javac -cp "${mainJavaPath}" -d target/classes ${mainJavaFiles.join(' ')}`;
          this.log.info(`🔍 Compiling main Java files: ${mainCompileCommand}`);
          
          try {
            await execAsync(mainCompileCommand, { cwd: repoPath, timeout: 60000 });
          } catch (compileError) {
            const javaErrors = this.parseCompilationErrors(compileError.stderr);
            errors.push(...javaErrors);
          }
        }
      } catch (error) {
        // Main Java directory doesn't exist or is empty
      }
      
      // Check if test Java directory exists
      try {
        const testJavaFiles = await this.findJavaFiles(testJavaPath);
        if (testJavaFiles.length > 0) {
          const testCompileCommand = `javac -cp "${mainJavaPath}:${testJavaPath}" -d target/test-classes ${testJavaFiles.join(' ')}`;
          this.log.info(`🔍 Compiling test Java files: ${testCompileCommand}`);
          
          try {
            await execAsync(testCompileCommand, { cwd: repoPath, timeout: 60000 });
          } catch (compileError) {
            const javaErrors = this.parseCompilationErrors(compileError.stderr);
            errors.push(...javaErrors);
          }
        }
      } catch (error) {
        // Test Java directory doesn't exist or is empty
      }
      
    } catch (error) {
      this.log.warn(`Error during direct Java compilation: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Find Java files in a directory
   * @param {string} directory - Directory to search
   * @returns {Array} - Array of Java file paths
   */
  async findJavaFiles(directory) {
    try {
      const { stdout } = await execAsync(`find ${directory} -name "*.java"`, { timeout: 30000 });
      return stdout.trim().split('\n').filter(file => file.trim() !== '');
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse compilation errors from build output
   * @param {string} buildOutput - Build output logs
   * @returns {Array} - Array of compilation errors
   */
  parseCompilationErrors(buildOutput) {
    const errors = [];
    const lines = buildOutput.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Maven compilation error pattern
      const mavenErrorMatch = line.match(/\[ERROR\] (.+\.java):\[(\d+),(\d+)\] (.+)/);
      if (mavenErrorMatch) {
        errors.push({
          type: 'compilation_error',
          file: mavenErrorMatch[1],
          line: parseInt(mavenErrorMatch[2]),
          column: parseInt(mavenErrorMatch[3]),
          message: mavenErrorMatch[4],
          confidence: 95
        });
        continue;
      }
      
      // Gradle compilation error pattern
      const gradleErrorMatch = line.match(/(.+\.java):(\d+): error: (.+)/);
      if (gradleErrorMatch) {
        errors.push({
          type: 'compilation_error',
          file: gradleErrorMatch[1],
          line: parseInt(gradleErrorMatch[2]),
          message: gradleErrorMatch[3],
          confidence: 95
        });
        continue;
      }
      
      // Direct javac compilation error pattern
      const javacErrorMatch = line.match(/(.+\.java):(\d+): error: (.+)/);
      if (javacErrorMatch) {
        errors.push({
          type: 'compilation_error',
          file: javacErrorMatch[1],
          line: parseInt(javacErrorMatch[2]),
          message: javacErrorMatch[3],
          confidence: 95
        });
        continue;
      }
      
      // Dependency resolution errors - capture each missing dependency separately
      if (line.includes('[ERROR] dependency:') && line.includes('was not found')) {
        const dependencyMatch = line.match(/\[ERROR\] dependency: ([^:]+):([^:]+):([^:]+)/);
        if (dependencyMatch) {
          errors.push({
            type: 'dependency_error',
            message: `Missing dependency: ${dependencyMatch[1]}:${dependencyMatch[2]}:${dependencyMatch[3]}`,
            file: 'pom.xml',
            line: 0,
            confidence: 95,
            groupId: dependencyMatch[1],
            artifactId: dependencyMatch[2],
            version: dependencyMatch[3]
          });
        }
        continue;
      }
      
      // Additional dependency error lines (the detailed error messages)
      if (line.includes('was not found in https://repo.maven.apache.org/maven2')) {
        const dependencyMatch = line.match(/([^:]+):([^:]+):([^:]+) was not found/);
        if (dependencyMatch) {
          errors.push({
            type: 'dependency_error',
            message: `Dependency not found in Maven Central: ${dependencyMatch[1]}:${dependencyMatch[2]}:${dependencyMatch[3]}`,
            file: 'pom.xml',
            line: 0,
            confidence: 95,
            groupId: dependencyMatch[1],
            artifactId: dependencyMatch[2],
            version: dependencyMatch[3]
          });
        }
        continue;
      }
      
      // General dependency resolution error
      if (line.includes('Could not resolve dependencies') && !line.includes('dependency:')) {
        errors.push({
          type: 'dependency_error',
          message: line.trim(),
          file: 'pom.xml',
          line: 0,
          confidence: 90
        });
        continue;
      }
      
      // Maven build failure
      if (line.includes('[ERROR] Failed to execute goal') && line.includes('Could not resolve dependencies')) {
        errors.push({
          type: 'build_error',
          message: line.trim(),
          file: 'pom.xml',
          line: 0,
          confidence: 95
        });
        continue;
      }
      
      // Warning about missing POM
      if (line.includes('[WARNING] The POM for') && line.includes('is missing')) {
        const pomMatch = line.match(/\[WARNING\] The POM for ([^:]+):([^:]+):([^:]+)/);
        if (pomMatch) {
          errors.push({
            type: 'dependency_warning',
            message: `Missing POM: ${pomMatch[1]}:${pomMatch[2]}:${pomMatch[3]}`,
            file: 'pom.xml',
            line: 0,
            confidence: 85,
            groupId: pomMatch[1],
            artifactId: pomMatch[2],
            version: pomMatch[3]
          });
        }
        continue;
      }
    }
    
    return errors;
  }

  /**
   * Extract Java version from build output
   * @param {string} buildOutput - Build output logs
   * @returns {string|null} - Java version or null
   */
  extractJavaVersion(buildOutput) {
    const versionMatch = buildOutput.match(/Java version: (\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : null;
  }

  /**
   * Find relevant workflow run for analysis
   * @param {Array} workflowRuns - Array of workflow runs
   * @returns {Object|null} - Relevant workflow run or null
   */
  findRelevantWorkflowRun(workflowRuns) {
    // Prioritize recent runs with Java/Maven/Gradle in the name
    const relevantRuns = workflowRuns.filter(run => 
      run.name.toLowerCase().includes('java') ||
      run.name.toLowerCase().includes('maven') ||
      run.name.toLowerCase().includes('gradle') ||
      run.name.toLowerCase().includes('build') ||
      run.name.toLowerCase().includes('test')
    );
    
    return relevantRuns.length > 0 ? relevantRuns[0] : workflowRuns[0];
  }

  /**
   * Cleanup temporary directory
   */
  async cleanup() {
    if (this.tempDir) {
      try {
        await rm(this.tempDir, { recursive: true, force: true });
        this.log.info(`🧹 Cleaned up temporary directory: ${this.tempDir}`);
      } catch (error) {
        this.log.warn(`Failed to cleanup temporary directory: ${error.message}`);
      }
      this.tempDir = null;
    }
  }
}
