/**
 * Deprecated Method Handler
 * 
 * Handles detection and replacement of deprecated methods in updated dependencies.
 * Use Case: Replacing Deprecated Methods After Library Update
 */
export class DeprecatedMethodHandler {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Detect deprecated method usage in build logs
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of deprecated method issues
   */
  async detectDeprecatedMethods(buildLogs, repoPath) {
    this.log.info('🔍 Detecting deprecated method usage...');

    const deprecatedMethods = [];
    const lines = buildLogs.split('\n');

    for (const line of lines) {
      // Look for deprecation warnings and errors
      const deprecationPatterns = [
        /warning: \[deprecation\] (\w+\([^)]*\)) in (\w+) has been deprecated/,
        /error: cannot find symbol.*method (\w+\([^)]*\))/,
        /warning: deprecated API used: (\w+\.\w+\([^)]*\))/,
        /The method (\w+\([^)]*\)) from the type (\w+) is deprecated/,
        /warning: (\w+\.\w+\([^)]*\)) is deprecated/
      ];

      for (const pattern of deprecationPatterns) {
        const match = line.match(pattern);
        if (match) {
          const methodInfo = await this.extractMethodInfo(match, line, repoPath);
          if (methodInfo) {
            deprecatedMethods.push(methodInfo);
          }
        }
      }
    }

    this.log.info(`📋 Found ${deprecatedMethods.length} deprecated method issues`);
    return deprecatedMethods;
  }

  /**
   * Extract detailed method information from build logs
   * @param {Array} match - Regex match results
   * @param {string} line - Full log line
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Method information
   */
  async extractMethodInfo(match, line, repoPath) {
    const methodSignature = match[1];
    const className = match[2] || this.extractClassFromLine(line);
    const fileName = this.extractFileFromLine(line);
    const lineNumber = this.extractLineNumberFromLine(line);

    // Find the actual source file
    const sourceFile = await this.findSourceFile(fileName, repoPath);
    if (!sourceFile) {
      return null;
    }

    return {
      type: 'deprecated_method',
      methodSignature,
      className,
      fileName,
      sourceFile,
      lineNumber,
      severity: 'medium',
      description: `Deprecated method ${methodSignature} in ${className}`,
      context: {
        buildLogLine: line,
        library: this.extractLibraryFromLine(line)
      }
    };
  }

  /**
   * Generate fix for deprecated method using Byam LLM
   * @param {Object} methodInfo - Deprecated method information
   * @param {Object} libraryInfo - Library version information
   * @returns {Promise<Object>} - Generated fix
   */
  async generateDeprecatedMethodFix(methodInfo, libraryInfo) {
    this.log.info(`🔧 Generating fix for deprecated method: ${methodInfo.methodSignature}`);

    // Read the source file to understand context
    const sourceCode = await this.readSourceFile(methodInfo.sourceFile);
    const methodContext = this.extractMethodContext(sourceCode, methodInfo.lineNumber);

    // Create comprehensive fix request for Byam
    const byamRequest = {
      type: 'deprecated_method_replacement',
      library: libraryInfo.name,
      oldVersion: libraryInfo.oldVersion,
      newVersion: libraryInfo.newVersion,
      deprecatedMethod: methodInfo.methodSignature,
      className: methodInfo.className,
      sourceCode: methodContext.surroundingCode,
      targetLine: methodContext.targetLine,
      imports: methodContext.imports,
      buildLogContext: methodInfo.context.buildLogLine
    };

    // Send to Byam for LLM analysis
    const byamResponse = await this.sendToByam(byamRequest);

    if (byamResponse.success) {
      return {
        type: 'deprecated_method_fix',
        description: `Replace deprecated method ${methodInfo.methodSignature}`,
        file: methodInfo.sourceFile,
        lineNumber: methodInfo.lineNumber,
        oldCode: methodContext.targetLine,
        newCode: byamResponse.replacementCode,
        additionalImports: byamResponse.additionalImports || [],
        explanation: byamResponse.explanation,
        confidence: byamResponse.confidence || 0.8
      };
    } else {
      // Fallback to pattern-based replacement
      return this.generatePatternBasedFix(methodInfo, methodContext);
    }
  }

  /**
   * Send request to Byam LLM for deprecated method analysis
   * @param {Object} request - Byam request
   * @returns {Promise<Object>} - Byam response
   */
  async sendToByam(request) {
    try {
      const { ByamClient } = await import('../byam/byam-client.js');
      const byamClient = new ByamClient(this.context, this.config);

      const prompt = this.buildByamPrompt(request);
      const response = await byamClient.generateFixes({
        type: 'deprecated_method_replacement',
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
You are analyzing a deprecated method in a Java project after a library update.

Library: ${request.library}
Version Update: ${request.oldVersion} -> ${request.newVersion}
Deprecated Method: ${request.deprecatedMethod}
Class: ${request.className}

Build Log Context:
${request.buildLogContext}

Current Code Context:
${request.sourceCode}

Target Line to Fix:
${request.targetLine}

Current Imports:
${request.imports.join('\n')}

Please provide:
1. The replacement method or approach
2. Updated code for the target line
3. Any additional imports needed
4. Explanation of the change
5. Confidence level (0.0-1.0)

Example deprecated method replacements:
- getInstance() -> getInstance2()
- StringUtils.isEmpty() -> StringUtils.isBlank()
- Date.getYear() -> LocalDate.now().getYear()

Return JSON format:
{
  "replacementCode": "updated line of code",
  "additionalImports": ["import.path.Class"],
  "explanation": "explanation of the change",
  "confidence": 0.9
}
`;
  }

  /**
   * Generate pattern-based fix as fallback
   * @param {Object} methodInfo - Method information
   * @param {Object} methodContext - Method context
   * @returns {Object} - Pattern-based fix
   */
  generatePatternBasedFix(methodInfo, methodContext) {
    const replacementPatterns = {
      // Apache Commons Lang
      'getInstance()': 'getInstance2()',
      'StringUtils.isEmpty': 'StringUtils.isBlank',
      'StringUtils.isNotEmpty': 'StringUtils.isNotBlank',
      
      // Java Date/Time API
      'Date.getYear': 'LocalDate.now().getYear',
      'Date.getMonth': 'LocalDate.now().getMonthValue',
      
      // Spring Framework
      'WebMvcConfigurerAdapter': 'WebMvcConfigurer',
      
      // Guava
      'Objects.toStringHelper': 'MoreObjects.toStringHelper'
    };

    const methodName = this.extractMethodName(methodInfo.methodSignature);
    const replacement = replacementPatterns[methodName];

    if (replacement) {
      const newCode = methodContext.targetLine.replace(methodName, replacement);
      
      return {
        type: 'deprecated_method_fix',
        description: `Replace deprecated method ${methodName}`,
        file: methodInfo.sourceFile,
        lineNumber: methodInfo.lineNumber,
        oldCode: methodContext.targetLine,
        newCode,
        additionalImports: [],
        explanation: `Pattern-based replacement: ${methodName} -> ${replacement}`,
        confidence: 0.7
      };
    }

    // Last resort: Add TODO comment
    return {
      type: 'deprecated_method_fix',
      description: `Manual review needed for deprecated method ${methodName}`,
      file: methodInfo.sourceFile,
      lineNumber: methodInfo.lineNumber,
      oldCode: methodContext.targetLine,
      newCode: `// TODO: Replace deprecated method ${methodName}\n${methodContext.targetLine}`,
      additionalImports: [],
      explanation: 'Manual review required for deprecated method replacement',
      confidence: 0.3
    };
  }

  /**
   * Apply deprecated method fix to source file
   * @param {Object} fix - Fix to apply
   * @returns {Promise<boolean>} - Success status
   */
  async applyDeprecatedMethodFix(fix) {
    this.log.info(`🔧 Applying deprecated method fix to ${fix.file}`);

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(fix.file, 'utf8');
      const lines = content.split('\n');

      // Apply the fix
      if (fix.lineNumber && fix.lineNumber > 0 && fix.lineNumber <= lines.length) {
        lines[fix.lineNumber - 1] = fix.newCode;
      }

      // Add imports if needed
      if (fix.additionalImports && fix.additionalImports.length > 0) {
        const updatedContent = this.addImports(lines.join('\n'), fix.additionalImports);
        await fs.writeFile(fix.file, updatedContent, 'utf8');
      } else {
        await fs.writeFile(fix.file, lines.join('\n'), 'utf8');
      }

      this.log.info(`✅ Successfully applied deprecated method fix`);
      return true;

    } catch (error) {
      this.log.error(`❌ Error applying deprecated method fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate deprecated method fix by rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @returns {Promise<Object>} - Validation result
   */
  async validateDeprecatedMethodFix(repoPath, buildTool) {
    this.log.info('🔍 Validating deprecated method fix...');

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

      // Check if deprecated method warnings are resolved
      const hasDeprecationWarnings = stderr.includes('[deprecation]') || 
                                   stderr.includes('deprecated');

      return {
        success: !hasDeprecationWarnings,
        buildLogs: stdout + stderr,
        deprecationWarningsRemoved: !hasDeprecationWarnings,
        message: hasDeprecationWarnings 
          ? 'Some deprecation warnings still exist'
          : 'All deprecation warnings resolved'
      };

    } catch (error) {
      return {
        success: false,
        buildLogs: error.message,
        error: 'Build failed after applying deprecated method fix'
      };
    }
  }

  // Helper methods
  extractClassFromLine(line) {
    const match = line.match(/(\w+)\.java:/);
    return match ? match[1] : null;
  }

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

  extractMethodName(signature) {
    const match = signature.match(/(\w+)\(/);
    return match ? match[1] : signature;
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

  extractMethodContext(sourceCode, lineNumber) {
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

    return {
      targetLine,
      surroundingCode,
      imports
    };
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
} 