/**
 * Removed Classes Handler
 * 
 * Handles detection and resolution of removed classes in updated dependencies.
 * Use Case: Handling Removed Classes in Updated Dependency
 */
export class RemovedClassesHandler {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Detect removed classes in build logs
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of removed class issues
   */
  async detectRemovedClasses(buildLogs, repoPath) {
    this.log.info('🔍 Detecting removed classes...');

    const removedClasses = [];
    const lines = buildLogs.split('\n');

    for (const line of lines) {
      // Look for removed class errors
      const removedClassPatterns = [
        /error: cannot find symbol.*class ([^\s]+)/,
        /error: package ([^\s]+) does not exist/,
        /ClassNotFoundException: ([^\s]+)/,
        /NoClassDefFoundError: ([^\s]+)/,
        /error: ([^\s]+) cannot be resolved to a type/,
        /The import ([^\s]+) cannot be resolved/,
        /error: cannot access ([^\s]+)/
      ];

      for (const pattern of removedClassPatterns) {
        const match = line.match(pattern);
        if (match) {
          const classInfo = await this.extractRemovedClassInfo(match, line, repoPath);
          if (classInfo) {
            removedClasses.push(classInfo);
          }
        }
      }
    }

    this.log.info(`📋 Found ${removedClasses.length} removed class issues`);
    return removedClasses;
  }

  /**
   * Extract detailed removed class information from build logs
   * @param {Array} match - Regex match results
   * @param {string} line - Full log line
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Removed class information
   */
  async extractRemovedClassInfo(match, line, repoPath) {
    const removedClass = match[1];
    const fileName = this.extractFileFromLine(line);
    const lineNumber = this.extractLineNumberFromLine(line);

    // Find the actual source file
    const sourceFile = await this.findSourceFile(fileName, repoPath);
    if (!sourceFile) {
      return null;
    }

    // Try to find replacement class
    const replacementSuggestion = await this.findReplacementClass(removedClass);

    return {
      type: 'removed_class',
      removedClass,
      fileName,
      sourceFile,
      lineNumber,
      replacementSuggestion,
      severity: 'high',
      description: `Class ${removedClass} was removed from dependency`,
      context: {
        buildLogLine: line,
        library: this.extractLibraryFromLine(line)
      }
    };
  }

  /**
   * Find potential replacement class
   * @param {string} removedClass - Removed class name
   * @returns {Promise<Object>} - Replacement suggestion
   */
  async findReplacementClass(removedClass) {
    // Common class replacement patterns
    const replacementPatterns = {
      // Common library migrations
      'OldUtil': 'NewUtil',
      'LegacyService': 'ModernService',
      'DeprecatedManager': 'CurrentManager',
      
      // Specific library patterns
      'com.google.common.base.Objects': 'java.util.Objects',
      'org.apache.commons.lang.StringUtils': 'org.apache.commons.lang3.StringUtils',
      'org.springframework.web.servlet.mvc.WebContentGenerator': 'org.springframework.web.servlet.mvc.WebMvcConfigurer',
      'org.hibernate.Session': 'org.hibernate.SessionFactory',
      
      // Pattern-based replacements
      'Old': 'New',
      'Legacy': 'Modern',
      'Deprecated': 'Current'
    };

    // Check for exact match
    if (replacementPatterns[removedClass]) {
      return {
        type: 'direct_replacement',
        newClass: replacementPatterns[removedClass],
        confidence: 0.9
      };
    }

    // Check for pattern-based replacements
    for (const [oldPattern, newPattern] of Object.entries(replacementPatterns)) {
      if (removedClass.includes(oldPattern)) {
        const newClass = removedClass.replace(oldPattern, newPattern);
        return {
          type: 'pattern_replacement',
          newClass,
          confidence: 0.7
        };
      }
    }

    // Check for common method alternatives
    const methodAlternatives = this.getMethodAlternatives(removedClass);
    if (methodAlternatives) {
      return {
        type: 'method_alternative',
        alternatives: methodAlternatives,
        confidence: 0.6
      };
    }

    return null;
  }

  /**
   * Generate fix for removed class using Byam LLM
   * @param {Object} classInfo - Removed class information
   * @param {Object} libraryInfo - Library version information
   * @returns {Promise<Object>} - Generated fix
   */
  async generateRemovedClassFix(classInfo, libraryInfo) {
    this.log.info(`🔧 Generating fix for removed class: ${classInfo.removedClass}`);

    // Read the source file to understand context
    const sourceCode = await this.readSourceFile(classInfo.sourceFile);
    const classContext = this.extractClassContext(sourceCode, classInfo.lineNumber);

    // Create comprehensive fix request for Byam
    const byamRequest = {
      type: 'removed_class_fix',
      library: libraryInfo.name,
      oldVersion: libraryInfo.oldVersion,
      newVersion: libraryInfo.newVersion,
      removedClass: classInfo.removedClass,
      replacementSuggestion: classInfo.replacementSuggestion,
      sourceCode: classContext.surroundingCode,
      targetLine: classContext.targetLine,
      imports: classContext.imports,
      usageContext: classContext.usageContext,
      buildLogContext: classInfo.context.buildLogLine
    };

    // Send to Byam for LLM analysis
    const byamResponse = await this.sendToByam(byamRequest);

    if (byamResponse.success) {
      return {
        type: 'removed_class_fix',
        description: `Replace removed class ${classInfo.removedClass}`,
        file: classInfo.sourceFile,
        lineNumber: classInfo.lineNumber,
        oldCode: classContext.targetLine,
        newCode: byamResponse.replacementCode,
        additionalImports: byamResponse.additionalImports || [],
        removedImports: byamResponse.removedImports || [],
        explanation: byamResponse.explanation,
        confidence: byamResponse.confidence || 0.8
      };
    } else {
      // Fallback to pattern-based replacement
      return this.generatePatternBasedFix(classInfo, classContext);
    }
  }

  /**
   * Send request to Byam LLM for removed class analysis
   * @param {Object} request - Byam request
   * @returns {Promise<Object>} - Byam response
   */
  async sendToByam(request) {
    try {
      const { ByamClient } = await import('../byam/byam-client.js');
      const byamClient = new ByamClient(this.context, this.config);

      const prompt = this.buildByamPrompt(request);
      const response = await byamClient.generateFixes({
        type: 'removed_class_fix',
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
You are analyzing a removed class in a Java project after a library update.

Library: ${request.library}
Version Update: ${request.oldVersion} -> ${request.newVersion}
Removed Class: ${request.removedClass}
Replacement Suggestion: ${request.replacementSuggestion ? JSON.stringify(request.replacementSuggestion) : 'None'}

Build Log Context:
${request.buildLogContext}

Current Code Context:
${request.sourceCode}

Target Line to Fix:
${request.targetLine}

Usage Context:
${request.usageContext}

Current Imports:
${request.imports.join('\n')}

Please analyze the removed class and provide:
1. The replacement class or approach
2. Updated code for the target line
3. Any additional imports needed
4. Any imports to remove
5. Explanation of the change
6. Confidence level (0.0-1.0)

Common class replacements:
- OldUtil -> NewUtil
- LegacyService -> ModernService
- com.google.common.base.Objects -> java.util.Objects
- Use superclass methods when available
- Refactor to use compatible alternatives

Return JSON format:
{
  "replacementCode": "updated line of code with replacement class",
  "additionalImports": ["import.path.NewClass"],
  "removedImports": ["import.path.OldClass"],
  "explanation": "explanation of the class replacement",
  "confidence": 0.9
}
`;
  }

  /**
   * Generate pattern-based fix as fallback
   * @param {Object} classInfo - Class information
   * @param {Object} classContext - Class context
   * @returns {Object} - Pattern-based fix
   */
  generatePatternBasedFix(classInfo, classContext) {
    const targetLine = classContext.targetLine;
    const removedClass = classInfo.removedClass;
    const replacement = classInfo.replacementSuggestion;

    let newCode = targetLine;
    let additionalImports = [];
    let removedImports = [];
    let explanation = 'Pattern-based class replacement';

    if (replacement) {
      switch (replacement.type) {
        case 'direct_replacement':
          newCode = targetLine.replace(removedClass, replacement.newClass);
          additionalImports = [replacement.newClass];
          removedImports = [removedClass];
          explanation = `Direct replacement: ${removedClass} -> ${replacement.newClass}`;
          break;
          
        case 'pattern_replacement':
          newCode = targetLine.replace(removedClass, replacement.newClass);
          additionalImports = [replacement.newClass];
          removedImports = [removedClass];
          explanation = `Pattern-based replacement: ${removedClass} -> ${replacement.newClass}`;
          break;
          
        case 'method_alternative':
          newCode = this.applyMethodAlternative(targetLine, replacement.alternatives);
          explanation = `Method alternative applied for ${removedClass}`;
          break;
      }
    } else {
      // Last resort: Add TODO comment
      newCode = `// TODO: Replace removed class ${removedClass}\n${targetLine}`;
      explanation = 'Manual review required for removed class';
    }

    return {
      type: 'removed_class_fix',
      description: `Replace removed class ${removedClass}`,
      file: classInfo.sourceFile,
      lineNumber: classInfo.lineNumber,
      oldCode: targetLine,
      newCode,
      additionalImports,
      removedImports,
      explanation,
      confidence: replacement ? replacement.confidence : 0.3
    };
  }

  /**
   * Apply method alternative to code line
   * @param {string} targetLine - Target line of code
   * @param {Array} alternatives - Method alternatives
   * @returns {string} - Updated code line
   */
  applyMethodAlternative(targetLine, alternatives) {
    for (const alternative of alternatives) {
      if (targetLine.includes(alternative.oldMethod)) {
        return targetLine.replace(alternative.oldMethod, alternative.newMethod);
      }
    }
    return targetLine;
  }

  /**
   * Get method alternatives for removed class
   * @param {string} removedClass - Removed class name
   * @returns {Array} - Method alternatives
   */
  getMethodAlternatives(removedClass) {
    const alternatives = {
      'OldUtil': [
        { oldMethod: 'OldUtil.getData()', newMethod: 'NewUtil.getData()' },
        { oldMethod: 'OldUtil.process()', newMethod: 'NewUtil.process()' }
      ],
      'LegacyService': [
        { oldMethod: 'LegacyService.execute()', newMethod: 'ModernService.execute()' },
        { oldMethod: 'LegacyService.initialize()', newMethod: 'ModernService.initialize()' }
      ]
    };

    return alternatives[removedClass] || null;
  }

  /**
   * Apply removed class fix to source file
   * @param {Object} fix - Fix to apply
   * @returns {Promise<boolean>} - Success status
   */
  async applyRemovedClassFix(fix) {
    this.log.info(`🔧 Applying removed class fix to ${fix.file}`);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(fix.file, 'utf8');
      const lines = content.split('\n');

      // Apply the fix
      if (fix.lineNumber && fix.lineNumber > 0 && fix.lineNumber <= lines.length) {
        lines[fix.lineNumber - 1] = fix.newCode;
      }

      // Update imports
      let updatedContent = lines.join('\n');
      
      // Remove old imports
      if (fix.removedImports && fix.removedImports.length > 0) {
        updatedContent = this.removeImports(updatedContent, fix.removedImports);
      }
      
      // Add new imports
      if (fix.additionalImports && fix.additionalImports.length > 0) {
        updatedContent = this.addImports(updatedContent, fix.additionalImports);
      }

      await fs.writeFile(fix.file, updatedContent, 'utf8');
      this.log.info(`✅ Successfully applied removed class fix`);
      return true;

    } catch (error) {
      this.log.error(`❌ Error applying removed class fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate removed class fix by rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @returns {Promise<Object>} - Validation result
   */
  async validateRemovedClassFix(repoPath, buildTool) {
    this.log.info('🔍 Validating removed class fix...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const buildCommand = buildTool === 'maven' 
        ? 'mvn clean compile -Dmaven.test.skip=true'
        : './gradlew compileJava';

      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: repoPath,
        timeout: 300000 // 5 minutes
      });

      // Check if removed class errors are resolved
      const hasRemovedClassErrors = stderr.includes('cannot find symbol') || 
                                  stderr.includes('package does not exist') ||
                                  stderr.includes('ClassNotFoundException');

      return {
        success: !hasRemovedClassErrors,
        buildLogs: stdout + stderr,
        removedClassErrorsResolved: !hasRemovedClassErrors,
        message: hasRemovedClassErrors 
          ? 'Some removed class errors still exist'
          : 'All removed class errors resolved'
      };

    } catch (error) {
      return {
        success: false,
        buildLogs: error.message,
        error: 'Build failed after applying removed class fix'
      };
    }
  }

  // Helper methods
  extractFileFromLine(line) {
    const match = line.match(/([^/\\]+\.java):/);
    return match ? match[1] : null;
  }

  extractLineNumberFromLine(line) {
    const match = line.match(/:(\d+):/);
    return match ? parseInt(match[1]) : null;
  }

  extractLibraryFromLine(line) {
    const match = line.match(/\[([\w.-]+)\]/);
    return match ? match[1] : null;
  }

  async findSourceFile(fileName, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const sourceDirs = [
        'src/main/java',
        'src/test/java',
        'src/java',
        'java'
      ];

      for (const dir of sourceDirs) {
        const fullPath = path.join(repoPath, dir);
        try {
          const files = await this.findFileRecursively(fullPath, fileName);
          if (files.length > 0) {
            return files[0];
          }
        } catch (error) {
          // Directory doesn't exist, continue
        }
      }

      return null;
    } catch (error) {
      this.log.error(`Error finding source file: ${error.message}`);
      return null;
    }
  }

  async findFileRecursively(dir, fileName) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findFileRecursively(fullPath, fileName);
          files.push(...subFiles);
        } else if (entry.name === fileName) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory access error, skip
    }

    return files;
  }

  async readSourceFile(filePath) {
    const fs = await import('fs/promises');
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      this.log.error(`Error reading source file: ${error.message}`);
      return null;
    }
  }

  extractClassContext(sourceCode, lineNumber) {
    const lines = sourceCode.split('\n');
    const targetLine = lines[lineNumber - 1] || '';
    
    // Extract surrounding context (5 lines before and after)
    const start = Math.max(0, lineNumber - 6);
    const end = Math.min(lines.length, lineNumber + 5);
    const surroundingCode = lines.slice(start, end).join('\n');

    // Extract imports
    const imports = lines
      .filter(line => line.trim().startsWith('import '))
      .map(line => line.trim());

    // Extract usage context (method/class context)
    const usageContext = this.extractUsageContext(lines, lineNumber);

    return {
      targetLine,
      surroundingCode,
      imports,
      usageContext
    };
  }

  extractUsageContext(lines, lineNumber) {
    // Find the method or class context
    let context = '';
    
    // Look backwards for method or class declaration
    for (let i = lineNumber - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.includes('public ') || line.includes('private ') || line.includes('protected ')) {
        if (line.includes('class ') || line.includes('interface ') || line.includes('(')) {
          context = line;
          break;
        }
      }
    }

    return context;
  }

  addImports(content, newImports) {
    const lines = content.split('\n');
    const packageIndex = lines.findIndex(line => line.startsWith('package '));
    const insertIndex = packageIndex >= 0 ? packageIndex + 1 : 0;

    // Add imports after package declaration
    for (let i = newImports.length - 1; i >= 0; i--) {
      const importLine = `import ${newImports[i]};`;
      if (!lines.some(line => line.trim() === importLine)) {
        lines.splice(insertIndex, 0, importLine);
      }
    }

    return lines.join('\n');
  }

  removeImports(content, importsToRemove) {
    const lines = content.split('\n');
    
    // Remove specified imports
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('import ')) {
        return !importsToRemove.some(importToRemove => 
          trimmedLine.includes(importToRemove)
        );
      }
      return true;
    });

    return filteredLines.join('\n');
  }
} 