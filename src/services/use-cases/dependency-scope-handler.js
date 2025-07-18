/**
 * Dependency Scope Handler
 * 
 * Handles detection and resolution of missing dependency scope issues after updates.
 * Use Case: Resolving Missing Dependency Scope After Update
 */
export class DependencyScopeHandler {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Detect missing dependency scope issues in build logs
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of dependency scope issues
   */
  async detectDependencyScopeIssues(buildLogs, repoPath) {
    this.log.info('🔍 Detecting dependency scope issues...');

    const scopeIssues = [];
    const lines = buildLogs.split('\n');

    for (const line of lines) {
      // Look for dependency scope related errors
      const scopePatterns = [
        /ClassNotFoundException: ([^\s]+)/,
        /NoClassDefFoundError: ([^\s]+)/,
        /Could not find or load main class ([^\s]+)/,
        /java\.lang\.ClassNotFoundException: ([^\s]+)/,
        /java\.lang\.NoClassDefFoundError: ([^\s]+)/,
        /Package ([^\s]+) does not exist/,
        /cannot find symbol.*class ([^\s]+)/
      ];

      for (const pattern of scopePatterns) {
        const match = line.match(pattern);
        if (match) {
          const scopeInfo = await this.extractScopeInfo(match, line, repoPath);
          if (scopeInfo) {
            scopeIssues.push(scopeInfo);
          }
        }
      }
    }

    // Also check for runtime dependency issues
    const runtimeIssues = await this.detectRuntimeScopeIssues(buildLogs, repoPath);
    scopeIssues.push(...runtimeIssues);

    this.log.info(`📋 Found ${scopeIssues.length} dependency scope issues`);
    return scopeIssues;
  }

  /**
   * Detect runtime dependency scope issues
   * @param {string} buildLogs - Build logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of runtime scope issues
   */
  async detectRuntimeScopeIssues(buildLogs, repoPath) {
    const runtimeIssues = [];
    const lines = buildLogs.split('\n');

    for (const line of lines) {
      // Look for runtime dependency conflicts
      const runtimePatterns = [
        /Multiple SLF4J bindings were found/,
        /Dependency convergence error/,
        /Found duplicate classes in \[([^\]]+)\]/,
        /Class path contains multiple SLF4J bindings/,
        /Conflicting dependencies found: ([^\s]+)/
      ];

      for (const pattern of runtimePatterns) {
        const match = line.match(pattern);
        if (match) {
          runtimeIssues.push({
            type: 'runtime_dependency_conflict',
            description: line.trim(),
            conflictingLibrary: match[1] || 'unknown',
            severity: 'medium',
            suggestedScope: 'provided'
          });
        }
      }
    }

    return runtimeIssues;
  }

  /**
   * Extract detailed scope information from build logs
   * @param {Array} match - Regex match results
   * @param {string} line - Full log line
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Scope information
   */
  async extractScopeInfo(match, line, repoPath) {
    const missingClass = match[1];
    const packageName = this.extractPackageFromClass(missingClass);
    
    // Try to identify which dependency provides this class
    const dependencyInfo = await this.identifyDependencyForClass(missingClass, repoPath);
    
    if (!dependencyInfo) {
      return null;
    }

    return {
      type: 'missing_dependency_scope',
      missingClass,
      packageName,
      dependencyInfo,
      severity: 'high',
      description: `Missing dependency scope for ${missingClass}`,
      suggestedScope: this.suggestScope(missingClass, dependencyInfo),
      context: {
        buildLogLine: line,
        library: dependencyInfo.groupId
      }
    };
  }

  /**
   * Identify which dependency provides a missing class
   * @param {string} className - Missing class name
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Dependency information
   */
  async identifyDependencyForClass(className, repoPath) {
    // Read pom.xml or build.gradle to find dependencies
    const buildTool = await this.detectBuildTool(repoPath);
    
    if (buildTool === 'maven') {
      return await this.findMavenDependencyForClass(className, repoPath);
    } else if (buildTool === 'gradle') {
      return await this.findGradleDependencyForClass(className, repoPath);
    }

    return null;
  }

  /**
   * Find Maven dependency for a class
   * @param {string} className - Class name
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Maven dependency info
   */
  async findMavenDependencyForClass(className, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const pomPath = path.join(repoPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf8');
      
      // Common class to dependency mappings
      const classToDependency = {
        'javax.servlet': { groupId: 'javax.servlet', artifactId: 'javax.servlet-api', scope: 'provided' },
        'org.springframework': { groupId: 'org.springframework', artifactId: 'spring-core', scope: 'compile' },
        'org.hibernate': { groupId: 'org.hibernate', artifactId: 'hibernate-core', scope: 'compile' },
        'org.slf4j': { groupId: 'org.slf4j', artifactId: 'slf4j-api', scope: 'compile' },
        'org.junit': { groupId: 'org.junit.jupiter', artifactId: 'junit-jupiter', scope: 'test' },
        'org.mockito': { groupId: 'org.mockito', artifactId: 'mockito-core', scope: 'test' }
      };

      // Find matching dependency
      for (const [packagePrefix, depInfo] of Object.entries(classToDependency)) {
        if (className.startsWith(packagePrefix)) {
          // Check if this dependency exists in pom.xml
          const dependencyRegex = new RegExp(`<groupId>${depInfo.groupId}</groupId>[\\s\\S]*?<artifactId>${depInfo.artifactId}</artifactId>`, 'g');
          if (dependencyRegex.test(pomContent)) {
            return depInfo;
          }
        }
      }

      return null;
    } catch (error) {
      this.log.error(`Error reading pom.xml: ${error.message}`);
      return null;
    }
  }

  /**
   * Find Gradle dependency for a class
   * @param {string} className - Class name
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Gradle dependency info
   */
  async findGradleDependencyForClass(className, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const buildGradlePath = path.join(repoPath, 'build.gradle');
      const buildGradleContent = await fs.readFile(buildGradlePath, 'utf8');
      
      // Common class to dependency mappings for Gradle
      const classToDependency = {
        'javax.servlet': { groupId: 'javax.servlet', artifactId: 'javax.servlet-api', scope: 'providedCompile' },
        'org.springframework': { groupId: 'org.springframework', artifactId: 'spring-core', scope: 'implementation' },
        'org.hibernate': { groupId: 'org.hibernate', artifactId: 'hibernate-core', scope: 'implementation' },
        'org.slf4j': { groupId: 'org.slf4j', artifactId: 'slf4j-api', scope: 'implementation' },
        'org.junit': { groupId: 'org.junit.jupiter', artifactId: 'junit-jupiter', scope: 'testImplementation' },
        'org.mockito': { groupId: 'org.mockito', artifactId: 'mockito-core', scope: 'testImplementation' }
      };

      // Find matching dependency
      for (const [packagePrefix, depInfo] of Object.entries(classToDependency)) {
        if (className.startsWith(packagePrefix)) {
          // Check if this dependency exists in build.gradle
          const dependencyRegex = new RegExp(`['"']${depInfo.groupId}:${depInfo.artifactId}`, 'g');
          if (dependencyRegex.test(buildGradleContent)) {
            return depInfo;
          }
        }
      }

      return null;
    } catch (error) {
      this.log.error(`Error reading build.gradle: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate fix for dependency scope issue using Byam LLM
   * @param {Object} scopeInfo - Dependency scope information
   * @param {Object} libraryInfo - Library version information
   * @returns {Promise<Object>} - Generated fix
   */
  async generateDependencyScopeFix(scopeInfo, libraryInfo) {
    this.log.info(`🔧 Generating fix for dependency scope issue: ${scopeInfo.missingClass}`);

    const buildTool = await this.detectBuildTool(scopeInfo.repoPath || '.');
    
    // Create comprehensive fix request for Byam
    const byamRequest = {
      type: 'dependency_scope_fix',
      library: libraryInfo.name,
      oldVersion: libraryInfo.oldVersion,
      newVersion: libraryInfo.newVersion,
      missingClass: scopeInfo.missingClass,
      packageName: scopeInfo.packageName,
      dependencyInfo: scopeInfo.dependencyInfo,
      suggestedScope: scopeInfo.suggestedScope,
      buildTool,
      buildLogContext: scopeInfo.context.buildLogLine
    };

    // Send to Byam for LLM analysis
    const byamResponse = await this.sendToByam(byamRequest);

    if (byamResponse.success) {
      return {
        type: 'dependency_scope_fix',
        description: `Fix dependency scope for ${scopeInfo.missingClass}`,
        buildTool,
        dependencyInfo: scopeInfo.dependencyInfo,
        newScope: byamResponse.recommendedScope,
        explanation: byamResponse.explanation,
        confidence: byamResponse.confidence || 0.8
      };
    } else {
      // Fallback to pattern-based fix
      return this.generatePatternBasedScopeFix(scopeInfo, buildTool);
    }
  }

  /**
   * Send request to Byam LLM for dependency scope analysis
   * @param {Object} request - Byam request
   * @returns {Promise<Object>} - Byam response
   */
  async sendToByam(request) {
    try {
      const { ByamClient } = await import('../byam/byam-client.js');
      const byamClient = new ByamClient(this.context, this.config);

      const prompt = this.buildByamPrompt(request);
      const response = await byamClient.generateFixes({
        type: 'dependency_scope_fix',
        prompt,
        context: request
      });

      return response;
    } catch (error) {
      this.log.error(`Error communicating with Byam: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build prompt for Byam LLM
   * @param {Object} request - Fix request
   * @returns {string} - Formatted prompt
   */
  buildByamPrompt(request) {
    return `
You are analyzing a dependency scope issue in a Java project after a library update.

Library: ${request.library}
Version Update: ${request.oldVersion} -> ${request.newVersion}
Build Tool: ${request.buildTool}
Missing Class: ${request.missingClass}
Package: ${request.packageName}
Current Dependency: ${request.dependencyInfo.groupId}:${request.dependencyInfo.artifactId}
Suggested Scope: ${request.suggestedScope}

Build Log Context:
${request.buildLogContext}

Please analyze the dependency scope issue and provide:
1. The recommended scope for this dependency
2. Explanation of why this scope is needed
3. Confidence level (0.0-1.0)

Common dependency scopes:
Maven: compile, provided, runtime, test, system
Gradle: implementation, api, compileOnly, runtimeOnly, testImplementation

Common scope patterns:
- Servlet API: provided (container provides it)
- JUnit/Testing: test/testImplementation
- SLF4J API: compile/implementation
- Spring Framework: compile/implementation
- Database drivers: runtime/runtimeOnly

Return JSON format:
{
  "recommendedScope": "provided",
  "explanation": "explanation of why this scope is needed",
  "confidence": 0.9
}
`;
  }

  /**
   * Generate pattern-based scope fix as fallback
   * @param {Object} scopeInfo - Scope information
   * @param {string} buildTool - Build tool
   * @returns {Object} - Pattern-based fix
   */
  generatePatternBasedScopeFix(scopeInfo, buildTool) {
    const className = scopeInfo.missingClass;
    let recommendedScope = scopeInfo.suggestedScope;
    let explanation = 'Pattern-based scope recommendation';

    // Pattern-based scope recommendations
    if (className.includes('javax.servlet')) {
      recommendedScope = buildTool === 'maven' ? 'provided' : 'compileOnly';
      explanation = 'Servlet API should be provided by the container';
    } else if (className.includes('org.junit') || className.includes('org.mockito')) {
      recommendedScope = buildTool === 'maven' ? 'test' : 'testImplementation';
      explanation = 'Testing frameworks should have test scope';
    } else if (className.includes('org.slf4j')) {
      recommendedScope = buildTool === 'maven' ? 'compile' : 'implementation';
      explanation = 'Logging API should be available at compile time';
    }

    return {
      type: 'dependency_scope_fix',
      description: `Fix dependency scope for ${className}`,
      buildTool,
      dependencyInfo: scopeInfo.dependencyInfo,
      newScope: recommendedScope,
      explanation,
      confidence: 0.7
    };
  }

  /**
   * Apply dependency scope fix to build file
   * @param {Object} fix - Fix to apply
   * @param {string} repoPath - Repository path
   * @returns {Promise<boolean>} - Success status
   */
  async applyDependencyScopeFix(fix, repoPath) {
    this.log.info(`🔧 Applying dependency scope fix for ${fix.dependencyInfo.artifactId}`);

    try {
      if (fix.buildTool === 'maven') {
        return await this.applyMavenScopeFix(fix, repoPath);
      } else if (fix.buildTool === 'gradle') {
        return await this.applyGradleScopeFix(fix, repoPath);
      }

      return false;
    } catch (error) {
      this.log.error(`❌ Error applying dependency scope fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Apply Maven scope fix
   * @param {Object} fix - Fix to apply
   * @param {string} repoPath - Repository path
   * @returns {Promise<boolean>} - Success status
   */
  async applyMavenScopeFix(fix, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const pomPath = path.join(repoPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf8');
      
      const { groupId, artifactId } = fix.dependencyInfo;
      const newScope = fix.newScope;

      // Find and update the dependency
      const dependencyRegex = new RegExp(
        `(<dependency>[\\s\\S]*?<groupId>${groupId}</groupId>[\\s\\S]*?<artifactId>${artifactId}</artifactId>[\\s\\S]*?)(</dependency>)`,
        'g'
      );

      const updatedContent = pomContent.replace(dependencyRegex, (match, beforeClosing, closing) => {
        // Check if scope already exists
        if (beforeClosing.includes('<scope>')) {
          // Update existing scope
          return beforeClosing.replace(/<scope>[^<]*<\/scope>/, `<scope>${newScope}</scope>`) + closing;
        } else {
          // Add new scope
          return beforeClosing + `\n        <scope>${newScope}</scope>` + closing;
        }
      });

      await fs.writeFile(pomPath, updatedContent, 'utf8');
      this.log.info(`✅ Successfully updated Maven dependency scope to ${newScope}`);
      return true;

    } catch (error) {
      this.log.error(`Error applying Maven scope fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Apply Gradle scope fix
   * @param {Object} fix - Fix to apply
   * @param {string} repoPath - Repository path
   * @returns {Promise<boolean>} - Success status
   */
  async applyGradleScopeFix(fix, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const buildGradlePath = path.join(repoPath, 'build.gradle');
      const buildGradleContent = await fs.readFile(buildGradlePath, 'utf8');
      
      const { groupId, artifactId } = fix.dependencyInfo;
      const newScope = fix.newScope;

      // Find and update the dependency
      const dependencyRegex = new RegExp(
        `(\\w+)\\s+['"']${groupId}:${artifactId}[^'"]*['"]`,
        'g'
      );

      const updatedContent = buildGradleContent.replace(dependencyRegex, (match) => {
        return match.replace(/^\w+/, newScope);
      });

      await fs.writeFile(buildGradlePath, updatedContent, 'utf8');
      this.log.info(`✅ Successfully updated Gradle dependency scope to ${newScope}`);
      return true;

    } catch (error) {
      this.log.error(`Error applying Gradle scope fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate dependency scope fix by rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @returns {Promise<Object>} - Validation result
   */
  async validateDependencyScopeFix(repoPath, buildTool) {
    this.log.info('🔍 Validating dependency scope fix...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const buildCommand = buildTool === 'maven' 
        ? 'mvn clean compile test -Dmaven.test.skip=false'
        : './gradlew build';

      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: repoPath,
        timeout: 300000 // 5 minutes
      });

      // Check if dependency scope errors are resolved
      const hasScopeErrors = stderr.includes('ClassNotFoundException') || 
                           stderr.includes('NoClassDefFoundError') ||
                           stderr.includes('Package does not exist');

      return {
        success: !hasScopeErrors,
        buildLogs: stdout + stderr,
        scopeErrorsRemoved: !hasScopeErrors,
        message: hasScopeErrors 
          ? 'Some dependency scope errors still exist'
          : 'All dependency scope errors resolved'
      };

    } catch (error) {
      return {
        success: false,
        buildLogs: error.message,
        error: 'Build failed after applying dependency scope fix'
      };
    }
  }

  // Helper methods
  extractPackageFromClass(className) {
    const lastDotIndex = className.lastIndexOf('.');
    return lastDotIndex > 0 ? className.substring(0, lastDotIndex) : className;
  }

  suggestScope(className, dependencyInfo) {
    // Common scope suggestions based on class patterns
    if (className.includes('javax.servlet')) return 'provided';
    if (className.includes('org.junit') || className.includes('org.mockito')) return 'test';
    if (className.includes('org.slf4j')) return 'compile';
    
    return dependencyInfo.scope || 'compile';
  }

  async detectBuildTool(repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const files = await fs.readdir(repoPath);
      
      if (files.includes('pom.xml')) {
        return 'maven';
      }
      
      if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
        return 'gradle';
      }

      return null;
    } catch (error) {
      this.log.error(`Error detecting build tool: ${error.message}`);
      return null;
    }
  }
} 