/**
 * Log Analyzer - Analyzes build logs to extract fixable issues
 * 
 * Design Patterns Used:
 * - Strategy Pattern: Different analysis strategies for different error types
 * - Chain of Responsibility: Error analyzers process logs in sequence
 * - Factory Pattern: Creates appropriate analyzers based on build tool
 */
export class LogAnalyzer {
  constructor(context) {
    this.context = context;
    this.log = context.log;
    
    // Initialize error analyzers
    this.errorAnalyzers = [
      new CompilationErrorAnalyzer(context),
      new DependencyConflictAnalyzer(context),
      new ApiCompatibilityAnalyzer(context),
      new ClassNotFoundAnalyzer(context),
      new MethodNotFoundAnalyzer(context),
      new PackageNotFoundAnalyzer(context)
    ];
  }

  /**
   * Analyze build logs to extract fixable issues
   * @param {string} buildLogs - Build logs content
   * @param {string} buildTool - Build tool (maven/gradle)
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Analysis result
   */
  async analyzeBuildLogs(buildLogs, buildTool, repoPath) {
    try {
      this.log.info(`🔍 Analyzing build logs for ${buildTool} project`);
      
      const issues = [];
      const logLines = buildLogs.split('\n');
      
      // Run each analyzer on the logs
      for (const analyzer of this.errorAnalyzers) {
        try {
          const analyzerIssues = await analyzer.analyze(logLines, buildTool, repoPath);
          issues.push(...analyzerIssues);
        } catch (error) {
          this.log.warn(`⚠️ Analyzer ${analyzer.constructor.name} failed: ${error.message}`);
        }
      }

      // Extract dependency information
      const dependencyInfo = await this.extractDependencyInfo(logLines, buildTool);
      
      // Deduplicate and prioritize issues
      const uniqueIssues = this.deduplicateIssues(issues);
      const prioritizedIssues = this.prioritizeIssues(uniqueIssues);
      
      this.log.info(`✅ Found ${prioritizedIssues.length} fixable issues`);
      
      return {
        issues: prioritizedIssues,
        dependencyInfo,
        buildTool,
        totalLogLines: logLines.length,
        analyzersRun: this.errorAnalyzers.length
      };
      
    } catch (error) {
      this.log.error(`❌ Log analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract dependency information from logs
   * @param {Array<string>} logLines - Log lines
   * @param {string} buildTool - Build tool
   * @returns {Promise<Object>} - Dependency information
   */
  async extractDependencyInfo(logLines, buildTool) {
    const dependencyInfo = {
      dependencies: [],
      conflicts: [],
      updates: [],
      buildTool
    };

    try {
      if (buildTool === 'maven') {
        dependencyInfo.dependencies = this.extractMavenDependencies(logLines);
        dependencyInfo.conflicts = this.extractMavenConflicts(logLines);
      } else if (buildTool === 'gradle') {
        dependencyInfo.dependencies = this.extractGradleDependencies(logLines);
        dependencyInfo.conflicts = this.extractGradleConflicts(logLines);
      }
    } catch (error) {
      this.log.warn(`⚠️ Failed to extract dependency info: ${error.message}`);
    }

    return dependencyInfo;
  }

  /**
   * Deduplicate similar issues
   * @param {Array} issues - Array of issues
   * @returns {Array} - Deduplicated issues
   */
  deduplicateIssues(issues) {
    const seen = new Set();
    const unique = [];

    for (const issue of issues) {
      const key = `${issue.type}-${issue.message}-${issue.location}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      }
    }

    return unique;
  }

  /**
   * Prioritize issues by severity and fixability
   * @param {Array} issues - Array of issues
   * @returns {Array} - Prioritized issues
   */
  prioritizeIssues(issues) {
    const priorityOrder = {
      'compilation_error': 1,
      'dependency_conflict': 2,
      'api_compatibility': 3,
      'class_not_found': 4,
      'method_not_found': 5,
      'package_not_found': 6
    };

    return issues.sort((a, b) => {
      const priorityA = priorityOrder[a.type] || 999;
      const priorityB = priorityOrder[b.type] || 999;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Secondary sort by confidence (higher confidence first)
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  /**
   * Extract Maven dependencies from logs
   * @param {Array<string>} logLines - Log lines
   * @returns {Array} - Maven dependencies
   */
  extractMavenDependencies(logLines) {
    const dependencies = [];
    
    for (const line of logLines) {
      // Look for Maven dependency patterns
      const depMatch = line.match(/\[INFO\]\s+([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+)/);
      if (depMatch) {
        dependencies.push({
          groupId: depMatch[1],
          artifactId: depMatch[2],
          version: depMatch[3],
          source: 'maven_log'
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Extract Maven conflicts from logs
   * @param {Array<string>} logLines - Log lines
   * @returns {Array} - Maven conflicts
   */
  extractMavenConflicts(logLines) {
    const conflicts = [];
    
    for (const line of logLines) {
      if (line.includes('conflict') || line.includes('version conflict')) {
        conflicts.push({
          type: 'version_conflict',
          message: line.trim(),
          source: 'maven_log'
        });
      }
    }
    
    return conflicts;
  }

  /**
   * Extract Gradle dependencies from logs
   * @param {Array<string>} logLines - Log lines
   * @returns {Array} - Gradle dependencies
   */
  extractGradleDependencies(logLines) {
    const dependencies = [];
    
    for (const line of logLines) {
      // Look for Gradle dependency patterns
      const depMatch = line.match(/([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+):([a-zA-Z0-9.-]+)/);
      if (depMatch && !line.includes('ERROR') && !line.includes('WARN')) {
        dependencies.push({
          groupId: depMatch[1],
          artifactId: depMatch[2],
          version: depMatch[3],
          source: 'gradle_log'
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Extract Gradle conflicts from logs
   * @param {Array<string>} logLines - Log lines
   * @returns {Array} - Gradle conflicts
   */
  extractGradleConflicts(logLines) {
    const conflicts = [];
    
    for (const line of logLines) {
      if (line.includes('conflict') || line.includes('version conflict')) {
        conflicts.push({
          type: 'version_conflict',
          message: line.trim(),
          source: 'gradle_log'
        });
      }
    }
    
    return conflicts;
  }
}

/**
 * Base class for error analyzers
 */
class ErrorAnalyzer {
  constructor(context) {
    this.context = context;
    this.log = context.log;
  }

  /**
   * Analyze logs for specific error type
   * @param {Array<string>} logLines - Log lines
   * @param {string} buildTool - Build tool
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Found issues
   */
  async analyze(logLines, buildTool, repoPath) {
    throw new Error('analyze method must be implemented by subclass');
  }
}

/**
 * Compilation error analyzer
 */
class CompilationErrorAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      // Maven compilation errors
      if (buildTool === 'maven' && line.includes('[ERROR]') && line.includes('.java:')) {
        const match = line.match(/\[ERROR\]\s+([^:]+):(\d+):\s*(.+)/);
        if (match) {
          issues.push({
            type: 'compilation_error',
            message: match[3].trim(),
            file: match[1],
            line: parseInt(match[2]),
            location: `${match[1]}:${match[2]}`,
            confidence: 0.9,
            context: this.getContext(logLines, i)
          });
        }
      }
      
      // Gradle compilation errors
      if (buildTool === 'gradle' && line.includes('error:') && line.includes('.java:')) {
        const match = line.match(/([^:]+):(\d+):\s*error:\s*(.+)/);
        if (match) {
          issues.push({
            type: 'compilation_error',
            message: match[3].trim(),
            file: match[1],
            line: parseInt(match[2]),
            location: `${match[1]}:${match[2]}`,
            confidence: 0.9,
            context: this.getContext(logLines, i)
          });
        }
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
}

/**
 * Dependency conflict analyzer
 */
class DependencyConflictAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      if (line.includes('conflict') || line.includes('version conflict')) {
        issues.push({
          type: 'dependency_conflict',
          message: line.trim(),
          location: 'build_dependencies',
          confidence: 0.8,
          context: this.getContext(logLines, i)
        });
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
}

/**
 * API compatibility analyzer
 */
class ApiCompatibilityAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      // Look for API compatibility issues
      if (line.includes('cannot find symbol') || 
          line.includes('method does not exist') ||
          line.includes('incompatible types')) {
        
        issues.push({
          type: 'api_compatibility',
          message: line.trim(),
          location: 'unknown',
          confidence: 0.7,
          context: this.getContext(logLines, i)
        });
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
}

/**
 * Class not found analyzer
 */
class ClassNotFoundAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      if (line.includes('ClassNotFoundException') || 
          line.includes('class not found') ||
          line.includes('cannot find class')) {
        
        const classMatch = line.match(/([a-zA-Z0-9.]+(?:Exception|Error))/);
        const className = classMatch ? classMatch[1] : 'unknown';
        
        issues.push({
          type: 'class_not_found',
          message: line.trim(),
          className: className,
          location: 'runtime',
          confidence: 0.8,
          context: this.getContext(logLines, i)
        });
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
}

/**
 * Method not found analyzer
 */
class MethodNotFoundAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      if (line.includes('NoSuchMethodError') || 
          line.includes('method not found') ||
          line.includes('cannot find method')) {
        
        issues.push({
          type: 'method_not_found',
          message: line.trim(),
          location: 'runtime',
          confidence: 0.8,
          context: this.getContext(logLines, i)
        });
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
}

/**
 * Package not found analyzer
 */
class PackageNotFoundAnalyzer extends ErrorAnalyzer {
  async analyze(logLines, buildTool, repoPath) {
    const issues = [];
    
    for (let i = 0; i < logLines.length; i++) {
      const line = logLines[i];
      
      if (line.includes('package does not exist') || 
          line.includes('package not found')) {
        
        const packageMatch = line.match(/package\s+([a-zA-Z0-9.]+)/);
        const packageName = packageMatch ? packageMatch[1] : 'unknown';
        
        issues.push({
          type: 'package_not_found',
          message: line.trim(),
          packageName: packageName,
          location: 'import',
          confidence: 0.8,
          context: this.getContext(logLines, i)
        });
      }
    }
    
    return issues;
  }

  getContext(logLines, index) {
    const start = Math.max(0, index - 2);
    const end = Math.min(logLines.length, index + 3);
    return logLines.slice(start, end).join('\n');
  }
} 