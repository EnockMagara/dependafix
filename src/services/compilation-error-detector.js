import { DependencyBreakingChangeAPI } from './dependency-breaking-change-api.js';

/**
 * Service for detecting compilation errors in Java projects (MVP)
 * Focuses on high-accuracy detection of dependency-related compilation errors
 */
export class CompilationErrorDetector {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
    this.breakingChangeAPI = new DependencyBreakingChangeAPI();
  }

  /**
   * Detect compilation errors in the repository with high accuracy
   * @returns {Array} - Array of compilation errors
   */
  async detectCompilationErrors() {
    const { repository } = this.context.payload;
    this.log.info(`🔍 Detecting compilation errors in ${repository.full_name}`);
    
    try {
      const errors = [];
      
      // Method 1: Check for actual build failures and compilation errors
      const buildErrors = await this.detectBuildFailures();
      errors.push(...buildErrors);
      
      // Method 2: Check for dependency-related compilation errors
      const dependencyErrors = await this.detectDependencyRelatedErrors();
      errors.push(...dependencyErrors);
      
      // Method 3: Check for recent breaking changes
      const breakingChanges = await this.detectBreakingChanges();
      errors.push(...breakingChanges);
      
      // Method 4: Check for Java file syntax errors (comprehensive)
      const syntaxErrors = await this.detectJavaSyntaxErrors();
      errors.push(...syntaxErrors);
      
      // Method 5: Check for dependency configuration issues
      const configErrors = await this.detectDependencyConfigErrors();
      errors.push(...configErrors);
      
      this.log.info(`Found ${errors.length} compilation errors`);
      return errors;
      
    } catch (error) {
      this.log.error(`Error detecting compilation errors: ${error.message}`);
      return [];
    }
  }

  /**
   * Detect Java syntax errors comprehensively
   * @returns {Array} - Array of syntax errors
   */
  async detectJavaSyntaxErrors() {
    const errors = [];
    
    try {
      // Get all Java files in the repository
      const javaFiles = await this.getJavaFiles();
      
      for (const file of javaFiles) {
        const content = await this.getFileContent(file);
        if (content) {
          const fileErrors = this.analyzeJavaContent(content, file);
          errors.push(...fileErrors);
        }
      }
      
    } catch (error) {
      this.log.error(`Error detecting Java syntax errors: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Get all Java files in the repository
   * @returns {Array} - Array of Java file paths
   */
  async getJavaFiles() {
    const { repository } = this.context.payload;
    const javaFiles = [];
    
    try {
      // Search for Java files
      const response = await this.octokit.rest.search.code({
        q: `repo:${repository.full_name} language:Java`,
        per_page: 100
      });
      
      return response.data.items.map(item => item.path);
    } catch (error) {
      this.log.error(`Error searching for Java files: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze Java file content for compilation errors
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Array} - Detected errors
   */
  analyzeJavaContent(content, filePath) {
    const errors = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines, comments, and imports
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || 
          trimmedLine.startsWith('*') || trimmedLine.startsWith('import') || 
          trimmedLine.startsWith('package')) {
        continue;
      }
      
      // Check for missing semicolons
      if (trimmedLine && !trimmedLine.endsWith(';') && !trimmedLine.endsWith('{') && 
          !trimmedLine.endsWith('}') && !trimmedLine.includes('class') && 
          !trimmedLine.includes('interface') && !trimmedLine.includes('enum') &&
          !trimmedLine.includes('public') && !trimmedLine.includes('private') &&
          !trimmedLine.includes('protected') && !trimmedLine.includes('static') &&
          !trimmedLine.includes('final') && !trimmedLine.includes('abstract')) {
        errors.push({
          type: 'syntax_error',
          message: `Potential missing semicolon on line ${i + 1}`,
          file: filePath,
          line: i + 1,
          confidence: 70,
          rawError: trimmedLine
        });
      }
      
      // Check for unmatched braces
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        errors.push({
          type: 'syntax_error',
          message: `Potential unmatched brace on line ${i + 1}`,
          file: filePath,
          line: i + 1,
          confidence: 75,
          rawError: trimmedLine
        });
      }
    }
    
    return errors;
  }

  /**
   * Detect dependency configuration errors
   * @returns {Array} - Array of dependency config errors
   */
  async detectDependencyConfigErrors() {
    const errors = [];
    
    try {
      // Check pom.xml for dependency issues
      const pomContent = await this.getFileContent('pom.xml');
      if (pomContent) {
        const pomErrors = await this.analyzePomXmlForDependencyIssues(pomContent);
        errors.push(...pomErrors);
      }
      
      // Check build.gradle for dependency issues
      const gradleContent = await this.getFileContent('build.gradle');
      if (gradleContent) {
        const gradleErrors = await this.analyzeGradleForDependencyIssues(gradleContent);
        errors.push(...gradleErrors);
      }
      
    } catch (error) {
      this.log.error(`Error detecting dependency config errors: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Analyze pom.xml for dependency issues with API integration
   * @param {string} content - pom.xml content
   * @returns {Array} - Detected errors
   */
  async analyzePomXmlForDependencyIssues(content) {
    const errors = [];
    
    try {
      // Extract dependencies from pom.xml
      const dependencies = this.extractDependenciesFromPomXml(content);
      
      // Check each dependency for breaking changes using API
      for (const dep of dependencies) {
        const breakingChangeAnalysis = await this.breakingChangeAPI.detectBreakingChanges(
          dep.groupId,
          dep.artifactId,
          dep.version,
          dep.version // For MVP, we'll check current version against itself
        );
        
        if (breakingChangeAnalysis.hasBreakingChanges) {
          // Add breaking changes as errors
          for (const breakingChange of breakingChangeAnalysis.breakingChanges) {
            errors.push({
              type: 'dependency_breaking_change',
              message: breakingChange.message,
              file: 'pom.xml',
              line: 0,
              confidence: breakingChange.confidence,
              severity: breakingChange.severity,
              rawError: `${dep.groupId}:${dep.artifactId}:${dep.version} - ${breakingChange.message}`
            });
          }
          
          // Add security vulnerabilities
          for (const vuln of breakingChangeAnalysis.securityVulnerabilities) {
            errors.push({
              type: 'security_vulnerability',
              message: `Security vulnerability: ${vuln.cveId} - ${vuln.description}`,
              file: 'pom.xml',
              line: 0,
              confidence: vuln.confidence,
              severity: vuln.severity || 'high',
              rawError: `${dep.groupId}:${dep.artifactId}:${dep.version} - ${vuln.cveId}`
            });
          }
        }
      }
      
      // Fallback to pattern-based detection for known issues
      const patternErrors = this.analyzePomXmlPatterns(content);
      errors.push(...patternErrors);
      
    } catch (error) {
      this.log.error(`Error analyzing pom.xml with API: ${error.message}`);
      // Fallback to pattern-based detection
      const patternErrors = this.analyzePomXmlPatterns(content);
      errors.push(...patternErrors);
    }
    
    return errors;
  }

  /**
   * Extract dependencies from pom.xml content
   * @param {string} content - pom.xml content
   * @returns {Array} - Array of dependency objects
   */
  extractDependenciesFromPomXml(content) {
    const dependencies = [];
    
    try {
      // Simple regex-based extraction for MVP
      const dependencyRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
      let match;
      
      while ((match = dependencyRegex.exec(content)) !== null) {
        dependencies.push({
          groupId: match[1].trim(),
          artifactId: match[2].trim(),
          version: match[3].trim()
        });
      }
      
    } catch (error) {
      this.log.error(`Error extracting dependencies from pom.xml: ${error.message}`);
    }
    
    return dependencies;
  }

  /**
   * Pattern-based analysis for pom.xml (fallback)
   * @param {string} content - pom.xml content
   * @returns {Array} - Detected errors
   */
  analyzePomXmlPatterns(content) {
    const errors = [];
    
    // Check for outdated dependencies
    const outdatedDeps = [
      { name: 'Guava', pattern: /<artifactId>guava<\/artifactId>[\s\S]*?<version>15\.0<\/version>/, issue: 'Very old version (15.0) - security vulnerabilities' },
      { name: 'Commons Lang', pattern: /<artifactId>commons-lang<\/artifactId>[\s\S]*?<version>3\.0<\/version>/, issue: 'Very old version (3.0) - missing features' },
      { name: 'Commons FileUpload', pattern: /<artifactId>commons-fileupload<\/artifactId>[\s\S]*?<version>1\.3\.1<\/version>/, issue: 'Security vulnerabilities in version 1.3.1' }
    ];
    
    for (const dep of outdatedDeps) {
      if (dep.pattern.test(content)) {
        errors.push({
          type: 'dependency_outdated',
          message: `Outdated dependency: ${dep.name} - ${dep.issue}`,
          file: 'pom.xml',
          line: 0,
          confidence: 95,
          rawError: `${dep.name} outdated version detected`
        });
      }
    }
    
    // Check for missing dependencies
    const missingDeps = [
      { name: 'JAXB', pattern: /javax\.xml\.bind/, issue: 'JAXB removed from Java 11+ - needs separate dependency' },
      { name: 'JAX-WS', pattern: /javax\.xml\.ws/, issue: 'JAX-WS removed from Java 11+ - needs separate dependency' }
    ];
    
    for (const dep of missingDeps) {
      if (dep.pattern.test(content)) {
        errors.push({
          type: 'dependency_missing',
          message: `Missing dependency: ${dep.name} - ${dep.issue}`,
          file: 'pom.xml',
          line: 0,
          confidence: 90,
          rawError: `${dep.name} missing dependency detected`
        });
      }
    }
    
    return errors;
  }

  /**
   * Analyze build.gradle for dependency issues
   * @param {string} content - build.gradle content
   * @returns {Array} - Detected errors
   */
  async analyzeGradleForDependencyIssues(content) {
    const errors = [];
    
    try {
      // Extract dependencies from build.gradle
      const dependencies = this.extractDependenciesFromGradle(content);
      
      // Check each dependency for breaking changes using API
      for (const dep of dependencies) {
        const breakingChangeAnalysis = await this.breakingChangeAPI.detectBreakingChanges(
          dep.groupId,
          dep.artifactId,
          dep.version,
          dep.version // For MVP, we'll check current version against itself
        );
        
        if (breakingChangeAnalysis.hasBreakingChanges) {
          // Add breaking changes as errors
          for (const breakingChange of breakingChangeAnalysis.breakingChanges) {
            errors.push({
              type: 'dependency_breaking_change',
              message: breakingChange.message,
              file: 'build.gradle',
              line: 0,
              confidence: breakingChange.confidence,
              severity: breakingChange.severity,
              rawError: `${dep.groupId}:${dep.artifactId}:${dep.version} - ${breakingChange.message}`
            });
          }
          
          // Add security vulnerabilities
          for (const vuln of breakingChangeAnalysis.securityVulnerabilities) {
            errors.push({
              type: 'security_vulnerability',
              message: `Security vulnerability: ${vuln.cveId} - ${vuln.description}`,
              file: 'build.gradle',
              line: 0,
              confidence: vuln.confidence,
              severity: vuln.severity || 'high',
              rawError: `${dep.groupId}:${dep.artifactId}:${dep.version} - ${vuln.cveId}`
            });
          }
        }
      }
      
      // Fallback to pattern-based detection for known issues
      const patternErrors = this.analyzeGradlePatterns(content);
      errors.push(...patternErrors);
      
    } catch (error) {
      this.log.error(`Error analyzing build.gradle with API: ${error.message}`);
      // Fallback to pattern-based detection
      const patternErrors = this.analyzeGradlePatterns(content);
      errors.push(...patternErrors);
    }
    
    return errors;
  }

  /**
   * Extract dependencies from build.gradle content
   * @param {string} content - build.gradle content
   * @returns {Array} - Array of dependency objects
   */
  extractDependenciesFromGradle(content) {
    const dependencies = [];
    
    try {
      // Simple regex-based extraction for MVP
      const dependencyRegex = /implementation\s+['"]([^:]+):([^:]+):([^'"]+)['"]/g;
      let match;
      
      while ((match = dependencyRegex.exec(content)) !== null) {
        dependencies.push({
          groupId: match[1].trim(),
          artifactId: match[2].trim(),
          version: match[3].trim()
        });
      }
      
    } catch (error) {
      this.log.error(`Error extracting dependencies from build.gradle: ${error.message}`);
    }
    
    return dependencies;
  }

  /**
   * Pattern-based analysis for build.gradle (fallback)
   * @param {string} content - build.gradle content
   * @returns {Array} - Detected errors
   */
  analyzeGradlePatterns(content) {
    const errors = [];
    
    // Check for outdated dependencies
    const outdatedDeps = [
      { name: 'Guava', pattern: /guava.*15\.0/, issue: 'Very old version (15.0) - security vulnerabilities' },
      { name: 'Commons Lang', pattern: /commons-lang.*3\.0/, issue: 'Very old version (3.0) - missing features' }
    ];
    
    for (const dep of outdatedDeps) {
      if (dep.pattern.test(content)) {
        errors.push({
          type: 'dependency_outdated',
          message: `Outdated dependency: ${dep.name} - ${dep.issue}`,
          file: 'build.gradle',
          line: 0,
          confidence: 95,
          rawError: `${dep.name} outdated version detected`
        });
      }
    }
    
    return errors;
  }

  /**
   * Detect actual build failures and compilation errors
   * @returns {Array} - Array of build errors
   */
  async detectBuildFailures() {
    const errors = [];
    
    try {
      // Check for Maven build failures
      const mavenErrors = await this.checkMavenBuildFailures();
      errors.push(...mavenErrors);
      
      // Check for Gradle build failures
      const gradleErrors = await this.checkGradleBuildFailures();
      errors.push(...gradleErrors);
      
      // Check for CI/CD build failures
      const ciErrors = await this.checkCIBuildFailures();
      errors.push(...ciErrors);
      
    } catch (error) {
      this.log.error(`Error detecting build failures: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Check for Maven build failures
   * @returns {Array} - Array of Maven errors
   */
  async checkMavenBuildFailures() {
    const errors = [];
    
    try {
      // Check for Maven build logs
      const buildLogs = ['target/maven.log', 'maven.log', 'build.log'];
      
      for (const logFile of buildLogs) {
        const content = await this.getFileContent(logFile);
        if (content) {
          const mavenErrors = this.parseMavenBuildLog(content, logFile);
          errors.push(...mavenErrors);
        }
      }
      
      // Check for Maven wrapper properties (indicates build issues)
      const wrapperProps = await this.getFileContent('.mvn/wrapper/maven-wrapper.properties');
      if (wrapperProps) {
        // This indicates Maven is being used, check for recent build issues
        const recentBuildIssues = await this.checkRecentBuildIssues();
        errors.push(...recentBuildIssues);
      }
      
    } catch (error) {
      // File doesn't exist, continue
    }
    
    return errors;
  }

  /**
   * Parse Maven build log for compilation errors
   * @param {string} content - Log content
   * @param {string} filePath - Log file path
   * @returns {Array} - Array of parsed errors
   */
  parseMavenBuildLog(content, filePath) {
    const errors = [];
    
    // High-confidence Maven compilation error patterns
    const mavenErrorPatterns = [
      {
        pattern: /\[ERROR\] COMPILATION ERROR/,
        type: 'maven_compilation_error',
        message: 'Maven compilation error detected',
        confidence: 95
      },
      {
        pattern: /\[ERROR\] cannot find symbol/,
        type: 'maven_symbol_not_found',
        message: 'Symbol not found error',
        confidence: 90
      },
      {
        pattern: /\[ERROR\] package .* does not exist/,
        type: 'maven_package_not_found',
        message: 'Package not found error',
        confidence: 90
      },
      {
        pattern: /\[ERROR\] incompatible types/,
        type: 'maven_type_mismatch',
        message: 'Type incompatibility error',
        confidence: 85
      },
      {
        pattern: /\[ERROR\] method .* cannot be applied/,
        type: 'maven_method_error',
        message: 'Method application error',
        confidence: 85
      },
      {
        pattern: /\[ERROR\] BUILD FAILURE/,
        type: 'maven_build_failure',
        message: 'Maven build failure',
        confidence: 95
      }
    ];
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of mavenErrorPatterns) {
        if (pattern.pattern.test(line)) {
          errors.push({
            type: pattern.type,
            message: pattern.message,
            file: filePath,
            line: i + 1,
            confidence: pattern.confidence,
            rawError: line.trim()
          });
        }
      }
    }
    
    return errors;
  }

  /**
   * Check for Gradle build failures
   * @returns {Array} - Array of Gradle errors
   */
  async checkGradleBuildFailures() {
    const errors = [];
    
    try {
      // Check for Gradle build logs
      const buildLogs = ['build.log', 'gradle.log', '.gradle/build.log'];
      
      for (const logFile of buildLogs) {
        const content = await this.getFileContent(logFile);
        if (content) {
          const gradleErrors = this.parseGradleBuildLog(content, logFile);
          errors.push(...gradleErrors);
        }
      }
      
    } catch (error) {
      // File doesn't exist, continue
    }
    
    return errors;
  }

  /**
   * Parse Gradle build log for compilation errors
   * @param {string} content - Log content
   * @param {string} filePath - Log file path
   * @returns {Array} - Array of parsed errors
   */
  parseGradleBuildLog(content, filePath) {
    const errors = [];
    
    // High-confidence Gradle compilation error patterns
    const gradleErrorPatterns = [
      {
        pattern: /FAILURE: Build failed/,
        type: 'gradle_build_failure',
        message: 'Gradle build failure',
        confidence: 95
      },
      {
        pattern: /error: cannot find symbol/,
        type: 'gradle_symbol_not_found',
        message: 'Symbol not found error',
        confidence: 90
      },
      {
        pattern: /error: package .* does not exist/,
        type: 'gradle_package_not_found',
        message: 'Package not found error',
        confidence: 90
      },
      {
        pattern: /error: incompatible types/,
        type: 'gradle_type_mismatch',
        message: 'Type incompatibility error',
        confidence: 85
      },
      {
        pattern: /error: method .* cannot be applied/,
        type: 'gradle_method_error',
        message: 'Method application error',
        confidence: 85
      }
    ];
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of gradleErrorPatterns) {
        if (pattern.pattern.test(line)) {
          errors.push({
            type: pattern.type,
            message: pattern.message,
            file: filePath,
            line: i + 1,
            confidence: pattern.confidence,
            rawError: line.trim()
          });
        }
      }
    }
    
    return errors;
  }

  /**
   * Check for CI/CD build failures
   * @returns {Array} - Array of CI errors
   */
  async checkCIBuildFailures() {
    const errors = [];
    
    try {
      // Check for GitHub Actions workflow files
      const workflowFiles = [
        '.github/workflows/build.yml',
        '.github/workflows/ci.yml',
        '.github/workflows/test.yml'
      ];
      
      for (const workflowFile of workflowFiles) {
        const content = await this.getFileContent(workflowFile);
        if (content) {
          // Check if there are recent failed builds
          const recentFailures = await this.checkRecentWorkflowFailures();
          errors.push(...recentFailures);
        }
      }
      
    } catch (error) {
      // File doesn't exist, continue
    }
    
    return errors;
  }

  /**
   * Detect dependency-related compilation errors
   * @returns {Array} - Array of dependency errors
   */
  async detectDependencyRelatedErrors() {
    const errors = [];
    
    try {
      // Check for dependency changes in recent commits
      const dependencyChanges = await this.checkRecentDependencyChanges();
      
      if (dependencyChanges.length > 0) {
        // If dependencies changed, look for related compilation errors
        const relatedErrors = await this.findDependencyRelatedErrors(dependencyChanges);
        errors.push(...relatedErrors);
      }
      
    } catch (error) {
      this.log.error(`Error detecting dependency-related errors: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Check for recent dependency changes
   * @returns {Array} - Array of dependency changes
   */
  async checkRecentDependencyChanges() {
    const changes = [];
    
    try {
      const { repository } = this.context.payload;
      
      // Get recent commits
      const response = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });
      
      for (const commit of response.data) {
        // Check if commit modified dependency files
        if (commit.files) {
          for (const file of commit.files) {
            if (this.isDependencyFile(file.filename)) {
              changes.push({
                commit: commit.sha,
                file: file.filename,
                message: commit.commit.message,
                date: commit.commit.author.date
              });
            }
          }
        }
      }
      
    } catch (error) {
      this.log.error(`Error checking dependency changes: ${error.message}`);
    }
    
    return changes;
  }

  /**
   * Check if file is a dependency file
   * @param {string} filename - File name
   * @returns {boolean} - True if dependency file
   */
  isDependencyFile(filename) {
    const dependencyFiles = [
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'package.json',
      'requirements.txt',
      'Cargo.toml',
      'go.mod'
    ];
    
    return dependencyFiles.some(depFile => filename.includes(depFile));
  }

  /**
   * Find errors related to dependency changes
   * @param {Array} dependencyChanges - Array of dependency changes
   * @returns {Array} - Array of related errors
   */
  async findDependencyRelatedErrors(dependencyChanges) {
    const errors = [];
    
    for (const change of dependencyChanges) {
      // Look for compilation errors in commits after dependency changes
      const relatedErrors = await this.findErrorsAfterDependencyChange(change);
      errors.push(...relatedErrors);
    }
    
    return errors;
  }

  /**
   * Find errors after a specific dependency change
   * @param {Object} dependencyChange - Dependency change object
   * @returns {Array} - Array of related errors
   */
  async findErrorsAfterDependencyChange(dependencyChange) {
    const errors = [];
    
    try {
      const { repository } = this.context.payload;
      
      // Get commits after the dependency change
      const response = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 20
      });
      
      let foundDependencyCommit = false;
      
      for (const commit of response.data) {
        if (commit.sha === dependencyChange.commit) {
          foundDependencyCommit = true;
          continue;
        }
        
        if (foundDependencyCommit) {
          // Check if this commit has compilation errors
          const commitErrors = this.analyzeCommitForErrors(commit);
          errors.push(...commitErrors);
        }
      }
      
    } catch (error) {
      this.log.error(`Error finding errors after dependency change: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Analyze commit for compilation errors
   * @param {Object} commit - Commit object
   * @returns {Array} - Array of errors
   */
  analyzeCommitForErrors(commit) {
    const errors = [];
    
    // Check commit message for error indicators
    const errorKeywords = [
      'fix', 'error', 'bug', 'fail', 'broken', 'compile', 'build', 'dependency'
    ];
    
    const lowerMessage = commit.commit.message.toLowerCase();
    const hasErrorKeywords = errorKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasErrorKeywords) {
      errors.push({
        type: 'commit_error_indicator',
        message: `Error-related commit: ${commit.commit.message.split('\n')[0]}`,
        file: 'unknown',
        line: 0,
        commit: commit.sha,
        confidence: 70,
        rawError: commit.commit.message
      });
    }
    
    return errors;
  }

  /**
   * Detect breaking changes
   * @returns {Array} - Array of breaking changes
   */
  async detectBreakingChanges() {
    const errors = [];
    
    try {
      // Check for breaking change indicators in recent commits
      const breakingChanges = await this.findBreakingChangeIndicators();
      errors.push(...breakingChanges);
      
    } catch (error) {
      this.log.error(`Error detecting breaking changes: ${error.message}`);
    }
    
    return errors;
  }

  /**
   * Find breaking change indicators
   * @returns {Array} - Array of breaking changes
   */
  async findBreakingChangeIndicators() {
    const changes = [];
    
    try {
      const { repository } = this.context.payload;
      
      // Get recent commits
      const response = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });
      
      for (const commit of response.data) {
        const lowerMessage = commit.commit.message.toLowerCase();
        
        // High-confidence breaking change indicators
        const breakingIndicators = [
          'breaking change',
          'breaking',
          'major version',
          'incompatible',
          'deprecated',
          'removed',
          'changed api'
        ];
        
        const isBreakingChange = breakingIndicators.some(indicator => 
          lowerMessage.includes(indicator)
        );
        
        if (isBreakingChange) {
          changes.push({
            type: 'breaking_change',
            message: `Breaking change detected: ${commit.commit.message.split('\n')[0]}`,
            file: 'unknown',
            line: 0,
            commit: commit.sha,
            confidence: 90,
            rawError: commit.commit.message
          });
        }
      }
      
    } catch (error) {
      this.log.error(`Error finding breaking changes: ${error.message}`);
    }
    
    return changes;
  }

  /**
   * Check for recent build issues
   * @returns {Array} - Array of build issues
   */
  async checkRecentBuildIssues() {
    const issues = [];
    
    try {
      const { repository } = this.context.payload;
      
      // Check for recent failed builds in GitHub Actions
      const response = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });
      
      for (const run of response.data.workflow_runs) {
        if (run.conclusion === 'failure') {
          issues.push({
            type: 'ci_build_failure',
            message: `CI build failed: ${run.name}`,
            file: 'unknown',
            line: 0,
            confidence: 85,
            rawError: `Workflow: ${run.name}, Status: ${run.conclusion}`
          });
        }
      }
      
    } catch (error) {
      this.log.error(`Error checking recent build issues: ${error.message}`);
    }
    
    return issues;
  }

  /**
   * Check for recent workflow failures
   * @returns {Array} - Array of workflow failures
   */
  async checkRecentWorkflowFailures() {
    const failures = [];
    
    try {
      const { repository } = this.context.payload;
      
      // Get recent workflow runs
      const response = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 5
      });
      
      for (const run of response.data.workflow_runs) {
        if (run.conclusion === 'failure') {
          failures.push({
            type: 'workflow_failure',
            message: `Workflow failed: ${run.name}`,
            file: 'unknown',
            line: 0,
            confidence: 80,
            rawError: `Workflow: ${run.name}, Status: ${run.conclusion}`
          });
        }
      }
      
    } catch (error) {
      this.log.error(`Error checking workflow failures: ${error.message}`);
    }
    
    return failures;
  }

  /**
   * Get file content
   * @param {string} filePath - File path
   * @returns {string|null} - File content or null
   */
  async getFileContent(filePath) {
    try {
      const { repository } = this.context.payload;
      
      const response = await this.octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: filePath,
      });
      
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      return null;
    }
  }
}
