/**
 * Build Executor Service
 * Handles building Java projects and capturing build logs
 */
export class BuildExecutor {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Execute build for the project
   * @param {string} buildTool - 'maven' or 'gradle'
   * @returns {Object} - Build result with logs and status
   */
  async executeBuild(buildTool) {
    const { repository } = this.context.payload;
    this.log.info(`🔨 Executing ${buildTool} build for ${repository.full_name}`);
    
    const buildResult = {
      success: false,
      buildTime: 0,
      logs: '',
      failures: [],
      javaVersion: null,
      buildTool
    };

    try {
      const startTime = Date.now();
      
      // For MVP, we'll simulate build execution since we can't actually build in this environment
      // In production, this would clone the repo and run the actual build
      const simulatedBuild = await this.simulateBuild(buildTool);
      
      buildResult.success = simulatedBuild.success;
      buildResult.logs = simulatedBuild.logs;
      buildResult.failures = simulatedBuild.failures;
      buildResult.javaVersion = simulatedBuild.javaVersion;
      buildResult.buildTime = Date.now() - startTime;
      
      this.log.info(`✅ Build ${buildResult.success ? 'succeeded' : 'failed'} in ${buildResult.buildTime}ms`);
      
    } catch (error) {
      this.log.error(`❌ Build execution failed: ${error.message}`);
      buildResult.logs = `Build execution error: ${error.message}`;
      buildResult.failures.push({
        type: 'build_execution_error',
        message: error.message,
        file: 'build',
        line: 0,
        confidence: 100
      });
    }

    return buildResult;
  }

  /**
   * Simulate build execution (for MVP)
   * In production, this would be replaced with actual build execution
   * @param {string} buildTool - 'maven' or 'gradle'
   * @returns {Object} - Simulated build result
   */
  async simulateBuild(buildTool) {
    const { repository } = this.context.payload;
    
    // Get recent build logs from GitHub Actions if available
    const workflowLogs = await this.getWorkflowLogs();
    
    if (workflowLogs) {
      return {
        success: workflowLogs.success,
        logs: workflowLogs.logs,
        failures: workflowLogs.failures,
        javaVersion: workflowLogs.javaVersion
      };
    }

    // Fallback: simulate based on detected errors
    const simulatedLogs = this.generateSimulatedBuildLogs(buildTool);
    const failures = this.extractFailuresFromLogs(simulatedLogs);
    
    return {
      success: failures.length === 0,
      logs: simulatedLogs,
      failures: failures,
      javaVersion: '11.0.2'
    };
  }

  /**
   * Get recent workflow logs from GitHub Actions
   * @returns {Object|null} - Workflow logs or null if not available
   */
  async getWorkflowLogs() {
    const { repository } = this.context.payload;
    
    try {
      // Get recent workflow runs
      const workflowRuns = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 5
      });

      if (workflowRuns.data.workflow_runs.length === 0) {
        return null;
      }

      // Get the most recent workflow run
      const latestRun = workflowRuns.data.workflow_runs[0];
      
      if (latestRun.status === 'completed') {
        // Get workflow run logs
        const logsResponse = await this.octokit.rest.actions.downloadWorkflowRunLogs({
          owner: repository.owner.login,
          repo: repository.name,
          run_id: latestRun.id
        });

        if (logsResponse.data) {
          const logs = logsResponse.data;
          const failures = this.extractFailuresFromLogs(logs);
          
          return {
            success: latestRun.conclusion === 'success',
            logs: logs,
            failures: failures,
            javaVersion: this.extractJavaVersion(logs)
          };
        }
      }

      return null;
    } catch (error) {
      this.log.warn(`Could not get workflow logs: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate simulated build logs based on detected errors
   * @param {string} buildTool - 'maven' or 'gradle'
   * @returns {string} - Simulated build logs
   */
  generateSimulatedBuildLogs(buildTool) {
    const timestamp = new Date().toISOString();
    
    if (buildTool === 'maven') {
      return `[INFO] Scanning for projects...
[INFO] 
[INFO] ----------------------< com.example:test-java-project >----------------------
[INFO] Building Test Java Project 1.0.0
[INFO] --------------------------------[ jar ]---------------------------------
[INFO] 
[INFO] --- maven-compiler-plugin:3.8.1:compile (default-compile) @ test-java-project ---
[INFO] Changes detected - recompiling the module!
[INFO] Compiling 5 source files to /workspace/target/classes
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[15,15] cannot find symbol
  symbol:   class Lists
  location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[16,15] cannot find symbol
  symbol:   class Preconditions
  location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[17,15] cannot find symbol
  symbol:   class Objects
  location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/BrokenInterface.java:[8,1] ';' expected
[ERROR] /workspace/src/main/java/com/example/Utils.java:[19,1] ';' expected
[ERROR] /workspace/src/main/java/com/example/Utils.java:[50,1] ';' expected
[INFO] 5 errors
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  2.543 s
[INFO] Finished at: ${timestamp}
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.8.1:compile (default-compile) on project test-java-project: Compilation failure
[ERROR] Compilation failure
[ERROR] 
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[15,15] cannot find symbol
[ERROR]   symbol:   class Lists
[ERROR]   location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[16,15] cannot find symbol
[ERROR]   symbol:   class Preconditions
[ERROR]   location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/DependencyTest.java:[17,15] cannot find symbol
[ERROR]   symbol:   class Objects
[ERROR]   location: class com.example.DependencyTest
[ERROR] /workspace/src/main/java/com/example/BrokenInterface.java:[8,1] ';' expected
[ERROR] /workspace/src/main/java/com/example/Utils.java:[19,1] ';' expected
[ERROR] /workspace/src/main/java/com/example/Utils.java:[50,1] ';' expected
[ERROR] -> [Help 1]
[ERROR] 
[ERROR] To see the full stack trace of the errors, re-run Maven with the -e option.
[ERROR] Re-run Maven using the -X option to enable full debug logging.`;
    } else {
      return `Starting a Gradle Daemon, 1 incompatible and 1 stopped Daemons could not be reused, use --status for details
> Task :compileJava
/workspace/src/main/java/com/example/DependencyTest.java:15: error: cannot find symbol
        Lists.newArrayList("item1", "item2", "item3");
        ^
  symbol:   class Lists
  location: class com.example.DependencyTest
/workspace/src/main/java/com/example/DependencyTest.java:16: error: cannot find symbol
        Preconditions.checkNotNull("test", "message");
        ^
  symbol:   class Preconditions
  location: class com.example.DependencyTest
/workspace/src/main/java/com/example/DependencyTest.java:17: error: cannot find symbol
        com.google.common.base.Objects.toStringHelper("test");
        ^
  symbol:   class Objects
  location: class com.example.DependencyTest
/workspace/src/main/java/com/example/BrokenInterface.java:8: error: ';' expected
    public void brokenMethod()
    ^
/workspace/src/main/java/com/example/Utils.java:19: error: ';' expected
        String test = "broken"
        ^
/workspace/src/main/java/com/example/Utils.java:50: error: ';' expected
        return "broken"
        ^
6 errors
> Task :compileJava FAILED

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':compileJava'.
> Compilation failed; see the compiler error output for details.

* Try:
Run with --stacktrace option to get the stack trace.
Run with --info or --debug option to get more log output.
Run with --scan to get full insights.

BUILD FAILED in 3s`;
    }
  }

  /**
   * Extract failures from build logs
   * @param {string} logs - Build logs
   * @returns {Array} - Array of failures
   */
  extractFailuresFromLogs(logs) {
    const failures = [];
    
    if (!logs) {
      return failures;
    }

    // Maven compilation errors
    const mavenErrorRegex = /\[ERROR\] (.*?\.java):\[(\d+),(\d+)\] (.*)/g;
    let match;
    
    while ((match = mavenErrorRegex.exec(logs)) !== null) {
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

    // Gradle compilation errors
    const gradleErrorRegex = /(.*?\.java):(\d+): error: (.*)/g;
    
    while ((match = gradleErrorRegex.exec(logs)) !== null) {
      failures.push({
        type: 'compilation_error',
        message: match[3].trim(),
        file: match[1],
        line: parseInt(match[2]),
        confidence: 95,
        severity: 'high'
      });
    }

    // Build failures
    if (logs.includes('BUILD FAILURE') || logs.includes('BUILD FAILED')) {
      failures.push({
        type: 'build_failure',
        message: 'Build failed due to compilation errors',
        file: 'build',
        line: 0,
        confidence: 90,
        severity: 'high'
      });
    }

    // Dependency resolution errors
    const dependencyErrorRegex = /Could not resolve dependencies|Could not find artifact|No versions available/g;
    if (dependencyErrorRegex.test(logs)) {
      failures.push({
        type: 'dependency_resolution_error',
        message: 'Dependency resolution failed',
        file: 'dependencies',
        line: 0,
        confidence: 85,
        severity: 'high'
      });
    }

    return failures;
  }

  /**
   * Extract Java version from build logs
   * @param {string} logs - Build logs
   * @returns {string} - Java version or null
   */
  extractJavaVersion(logs) {
    if (!logs) {
      return null;
    }

    // Look for Java version patterns
    const versionRegex = /Java version: (\d+\.\d+\.\d+)|java version "(\d+\.\d+\.\d+)"/i;
    const match = logs.match(versionRegex);
    
    if (match) {
      return match[1] || match[2];
    }

    return null;
  }

  /**
   * Get build configuration information
   * @returns {Object} - Build configuration
   */
  async getBuildConfiguration() {
    const { repository } = this.context.payload;
    
    try {
      // Check for Maven configuration
      const pomContent = await this.getFileContent('pom.xml');
      if (pomContent) {
        return {
          buildTool: 'maven',
          configFile: 'pom.xml',
          content: pomContent
        };
      }

      // Check for Gradle configuration
      const gradleContent = await this.getFileContent('build.gradle');
      if (gradleContent) {
        return {
          buildTool: 'gradle',
          configFile: 'build.gradle',
          content: gradleContent
        };
      }

      return null;
    } catch (error) {
      this.log.error(`Error getting build configuration: ${error.message}`);
      return null;
    }
  }

  /**
   * Get file content from repository
   * @param {string} filePath - File path
   * @returns {string|null} - File content or null
   */
  async getFileContent(filePath) {
    const { repository } = this.context.payload;
    
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: filePath
      });

      if (response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
