/**
 * API Signature Handler
 * 
 * Handles detection and adaptation to changed API signatures in dependency updates.
 * Use Case: Adapting to Changed API Signatures in Dependency Update
 */
export class ApiSignatureHandler {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Detect API signature changes in build logs
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of API signature issues
   */
  async detectApiSignatureChanges(buildLogs, repoPath) {
    this.log.info('🔍 Detecting API signature changes...');

    const signatureChanges = [];
    const lines = buildLogs.split('\n');

    for (const line of lines) {
      // Look for method signature change errors
      const signaturePatterns = [
        /error: method (\w+) in class (\w+) cannot be applied to given types/,
        /error: cannot find symbol.*method (\w+\([^)]*\))/,
        /error: incompatible types: (\w+) cannot be converted to (\w+)/,
        /error: method (\w+) in class (\w+) cannot be applied to given types.*required: ([^;]+).*found: ([^;]+)/,
        /error: no suitable method found for (\w+\([^)]*\))/,
        /The method (\w+\([^)]*\)) is undefined for the type (\w+)/
      ];

      for (const pattern of signaturePatterns) {
        const match = line.match(pattern);
        if (match) {
          const signatureInfo = await this.extractSignatureInfo(match, line, repoPath);
          if (signatureInfo) {
            signatureChanges.push(signatureInfo);
          }
        }
      }
    }

    this.log.info(`📋 Found ${signatureChanges.length} API signature change issues`);
    return signatureChanges;
  }

  /**
   * Extract detailed signature information from build logs
   * @param {Array} match - Regex match results
   * @param {string} line - Full log line
   * @param {string} repoPath - Repository path
   * @returns {Promise<Object>} - Signature information
   */
  async extractSignatureInfo(match, line, repoPath) {
    const methodName = match[1];
    const className = match[2] || this.extractClassFromLine(line);
    const fileName = this.extractFileFromLine(line);
    const lineNumber = this.extractLineNumberFromLine(line);
    const requiredSignature = match[3] || null;
    const foundSignature = match[4] || null;

    // Find the actual source file
    const sourceFile = await this.findSourceFile(fileName, repoPath);
    if (!sourceFile) {
      return null;
    }

    return {
      type: 'api_signature_change',
      methodName,
      className,
      fileName,
      sourceFile,
      lineNumber,
      requiredSignature,
      foundSignature,
      severity: 'high',
      description: `API signature changed for ${methodName} in ${className}`,
      context: {
        buildLogLine: line,
        library: this.extractLibraryFromLine(line)
      }
    };
  }

  /**
   * Generate fix for API signature change using Byam LLM
   * @param {Object} signatureInfo - API signature information
   * @param {Object} libraryInfo - Library version information
   * @returns {Promise<Object>} - Generated fix
   */
  async generateApiSignatureFix(signatureInfo, libraryInfo) {
    this.log.info(`🔧 Generating fix for API signature change: ${signatureInfo.methodName}`);

    // Read the source file to understand context
    const sourceCode = await this.readSourceFile(signatureInfo.sourceFile);
    const methodContext = this.extractMethodContext(sourceCode, signatureInfo.lineNumber);

    // Create comprehensive fix request for Byam
    const byamRequest = {
      type: 'api_signature_change',
      library: libraryInfo.name,
      oldVersion: libraryInfo.oldVersion,
      newVersion: libraryInfo.newVersion,
      methodName: signatureInfo.methodName,
      className: signatureInfo.className,
      requiredSignature: signatureInfo.requiredSignature,
      foundSignature: signatureInfo.foundSignature,
      sourceCode: methodContext.surroundingCode,
      targetLine: methodContext.targetLine,
      imports: methodContext.imports,
      buildLogContext: signatureInfo.context.buildLogLine
    };

    // Send to Byam for LLM analysis
    const byamResponse = await this.sendToByam(byamRequest);

    if (byamResponse.success) {
      return {
        type: 'api_signature_fix',
        description: `Adapt to API signature change for ${signatureInfo.methodName}`,
        file: signatureInfo.sourceFile,
        lineNumber: signatureInfo.lineNumber,
        oldCode: methodContext.targetLine,
        newCode: byamResponse.replacementCode,
        additionalImports: byamResponse.additionalImports || [],
        explanation: byamResponse.explanation,
        confidence: byamResponse.confidence || 0.8
      };
    } else {
      // Fallback to pattern-based replacement
      return this.generatePatternBasedFix(signatureInfo, methodContext);
    }
  }

  /**
   * Send request to Byam LLM for API signature analysis
   * @param {Object} request - Byam request
   * @returns {Promise<Object>} - Byam response
   */
  async sendToByam(request) {
    try {
      const { ByamClient } = await import('../byam/byam-client.js');
      const byamClient = new ByamClient(this.context, this.config);

      const prompt = this.buildByamPrompt(request);
      const response = await byamClient.generateFixes({
        type: 'api_signature_change',
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
You are analyzing an API signature change in a Java project after a library update.

Library: ${request.library}
Version Update: ${request.oldVersion} -> ${request.newVersion}
Method: ${request.methodName}
Class: ${request.className}
Required Signature: ${request.requiredSignature || 'Not specified'}
Found Signature: ${request.foundSignature || 'Not specified'}

Build Log Context:
${request.buildLogContext}

Current Code Context:
${request.sourceCode}

Target Line to Fix:
${request.targetLine}

Current Imports:
${request.imports.join('\n')}

Please analyze the API signature change and provide:
1. The updated method call with correct parameters
2. Any additional imports needed
3. Explanation of the change
4. Confidence level (0.0-1.0)

Common API signature changes:
- processData(String) -> processData(String, int)
- createUser(String name) -> createUser(String name, UserRole role)
- getData() -> getData(boolean includeMetadata)
- saveEntity(Entity) -> saveEntity(Entity, SaveOptions options)

Return JSON format:
{
  "replacementCode": "updated line of code with correct method signature",
  "additionalImports": ["import.path.Class"],
  "explanation": "explanation of the signature change and adaptation",
  "confidence": 0.9
}
`;
  }

  /**
   * Generate pattern-based fix as fallback
   * @param {Object} signatureInfo - Signature information
   * @param {Object} methodContext - Method context
   * @returns {Object} - Pattern-based fix
   */
  generatePatternBasedFix(signatureInfo, methodContext) {
    const targetLine = methodContext.targetLine;
    const methodName = signatureInfo.methodName;

    // Common API signature change patterns
    const signaturePatterns = [
      {
        pattern: /(\w+)\(([^)]*)\)/,
        replacement: (match, method, params) => {
          // Add default parameter for common cases
          if (params.trim() === '') {
            return `${method}(null)`; // Add null parameter
          } else if (!params.includes(',')) {
            return `${method}(${params}, null)`; // Add second parameter
          }
          return match[0]; // No change
        }
      }
    ];

    let newCode = targetLine;
    let explanation = 'Pattern-based API signature adaptation';

    // Apply pattern-based transformations
    for (const pattern of signaturePatterns) {
      const match = targetLine.match(pattern.pattern);
      if (match) {
        newCode = targetLine.replace(pattern.pattern, pattern.replacement);
        explanation = 'Added default parameter to match new API signature';
        break;
      }
    }

    // If no pattern matched, add TODO comment
    if (newCode === targetLine) {
      newCode = `// TODO: Adapt to new API signature for ${methodName}\n${targetLine}`;
      explanation = 'Manual review required for API signature change';
    }

    return {
      type: 'api_signature_fix',
      description: `Adapt API signature for ${methodName}`,
      file: signatureInfo.sourceFile,
      lineNumber: signatureInfo.lineNumber,
      oldCode: targetLine,
      newCode,
      additionalImports: [],
      explanation,
      confidence: newCode.includes('TODO') ? 0.3 : 0.6
    };
  }

  /**
   * Apply API signature fix to source file
   * @param {Object} fix - Fix to apply
   * @returns {Promise<boolean>} - Success status
   */
  async applyApiSignatureFix(fix) {
    this.log.info(`🔧 Applying API signature fix to ${fix.file}`);

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

      this.log.info(`✅ Successfully applied API signature fix`);
      return true;

    } catch (error) {
      this.log.error(`❌ Error applying API signature fix: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate API signature fix by rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @returns {Promise<Object>} - Validation result
   */
  async validateApiSignatureFix(repoPath, buildTool) {
    this.log.info('🔍 Validating API signature fix...');

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

      // Check if API signature errors are resolved
      const hasSignatureErrors = stderr.includes('cannot be applied to given types') || 
                               stderr.includes('cannot find symbol') ||
                               stderr.includes('incompatible types');

      return {
        success: !hasSignatureErrors,
        buildLogs: stdout + stderr,
        signatureErrorsRemoved: !hasSignatureErrors,
        message: hasSignatureErrors 
          ? 'Some API signature errors still exist'
          : 'All API signature errors resolved'
      };

    } catch (error) {
      return {
        success: false,
        buildLogs: error.message,
        error: 'Build failed after applying API signature fix'
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