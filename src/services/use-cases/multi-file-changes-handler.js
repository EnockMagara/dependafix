/**
 * Multi-File Changes Handler
 * 
 * Handles detection and synchronization of multi-file changes from dependency updates.
 * Use Case: Synchronizing Multi-File Changes from Dependency Update
 */
export class MultiFileChangesHandler {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = config;
  }

  /**
   * Detect multi-file changes in build logs
   * @param {string} buildLogs - Build failure logs
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of multi-file change issues
   */
  async detectMultiFileChanges(buildLogs, repoPath) {
    this.log.info('🔍 Detecting multi-file changes...');

    const multiFileChanges = [];
    const lines = buildLogs.split('\n');
    const fileIssues = new Map();

    for (const line of lines) {
      // Look for cross-file dependency errors
      const multiFilePatterns = [
        /error: cannot find symbol.*in class ([^\s]+)/,
        /error: method ([^\s]+) in class ([^\s]+) cannot be applied/,
        /error: incompatible types.*([^\s]+\.java):(\d+)/,
        /error: ([^\s]+\.java):(\d+): cannot find symbol/,
        /The method ([^\s]+) is undefined for the type ([^\s]+)/,
        /error: package ([^\s]+) does not exist.*([^\s]+\.java)/
      ];

      for (const pattern of multiFilePatterns) {
        const match = line.match(pattern);
        if (match) {
          const fileName = this.extractFileFromLine(line);
          const className = match[1] || match[2];
          
          if (fileName && className) {
            if (!fileIssues.has(fileName)) {
              fileIssues.set(fileName, []);
            }
            fileIssues.get(fileName).push({
              line,
              className,
              type: this.categorizeError(line)
            });
          }
        }
      }
    }

    // Group related files
    const relatedFiles = await this.groupRelatedFiles(fileIssues, repoPath);
    
    for (const group of relatedFiles) {
      if (group.files.length > 1) {
        multiFileChanges.push({
          type: 'multi_file_change',
          files: group.files,
          relationshipType: group.relationshipType,
          severity: 'high',
          description: `Multi-file changes needed for ${group.relationshipType}`,
          context: {
            affectedClasses: group.affectedClasses,
            changeType: group.changeType
          }
        });
      }
    }

    this.log.info(`📋 Found ${multiFileChanges.length} multi-file change groups`);
    return multiFileChanges;
  }

  /**
   * Group related files based on their dependencies
   * @param {Map} fileIssues - Map of file issues
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of related file groups
   */
  async groupRelatedFiles(fileIssues, repoPath) {
    const groups = [];
    const processedFiles = new Set();

    for (const [fileName, issues] of fileIssues) {
      if (processedFiles.has(fileName)) continue;

      const relatedFiles = await this.findRelatedFiles(fileName, issues, fileIssues, repoPath);
      
      if (relatedFiles.length > 0) {
        const group = {
          files: [fileName, ...relatedFiles],
          relationshipType: this.determineRelationshipType(fileName, relatedFiles, repoPath),
          affectedClasses: this.extractAffectedClasses(fileName, issues),
          changeType: this.determineChangeType(issues)
        };
        
        groups.push(group);
        
        // Mark files as processed
        group.files.forEach(file => processedFiles.add(file));
      }
    }

    return groups;
  }

  /**
   * Find files related to the current file
   * @param {string} fileName - Current file name
   * @param {Array} issues - Issues in current file
   * @param {Map} allFileIssues - All file issues
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of related file names
   */
  async findRelatedFiles(fileName, issues, allFileIssues, repoPath) {
    const relatedFiles = [];
    const affectedClasses = this.extractAffectedClasses(fileName, issues);

    // Find files that reference the same classes
    for (const [otherFileName, otherIssues] of allFileIssues) {
      if (otherFileName === fileName) continue;

      const otherAffectedClasses = this.extractAffectedClasses(otherFileName, otherIssues);
      
      // Check for class overlap
      const hasOverlap = affectedClasses.some(cls => otherAffectedClasses.includes(cls));
      
      if (hasOverlap) {
        relatedFiles.push(otherFileName);
      }
    }

    // Also check for import relationships
    const importRelated = await this.findImportRelatedFiles(fileName, affectedClasses, repoPath);
    relatedFiles.push(...importRelated);

    return [...new Set(relatedFiles)]; // Remove duplicates
  }

  /**
   * Find files related through imports
   * @param {string} fileName - Current file name
   * @param {Array} affectedClasses - Affected classes
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of import-related files
   */
  async findImportRelatedFiles(fileName, affectedClasses, repoPath) {
    const relatedFiles = [];
    
    try {
      const sourceFile = await this.findSourceFile(fileName, repoPath);
      if (!sourceFile) return relatedFiles;

      const sourceCode = await this.readSourceFile(sourceFile);
      const imports = this.extractImports(sourceCode);
      const packageName = this.extractPackageName(sourceCode);

      // Find files in the same package or related packages
      const packageFiles = await this.findFilesInPackage(packageName, repoPath);
      
      for (const packageFile of packageFiles) {
        const packageFileCode = await this.readSourceFile(packageFile);
        const packageFileClasses = this.extractClassNames(packageFileCode);
        
        // Check if any affected classes are defined in this file
        const hasAffectedClass = affectedClasses.some(cls => 
          packageFileClasses.includes(cls)
        );
        
        if (hasAffectedClass) {
          const relativeFileName = this.getRelativeFileName(packageFile, repoPath);
          if (relativeFileName && relativeFileName !== fileName) {
            relatedFiles.push(relativeFileName);
          }
        }
      }

    } catch (error) {
      this.log.error(`Error finding import-related files: ${error.message}`);
    }

    return relatedFiles;
  }

  /**
   * Generate coordinated fixes for multi-file changes using Byam LLM
   * @param {Object} multiFileChange - Multi-file change information
   * @param {Object} libraryInfo - Library version information
   * @param {string} repoPath - Repository path
   * @returns {Promise<Array>} - Array of coordinated fixes
   */
  async generateMultiFileFixes(multiFileChange, libraryInfo, repoPath) {
    this.log.info(`🔧 Generating coordinated fixes for ${multiFileChange.files.length} files`);

    const fixes = [];
    const fileContexts = {};

    // Gather context from all affected files
    for (const fileName of multiFileChange.files) {
      const sourceFile = await this.findSourceFile(fileName, repoPath);
      if (sourceFile) {
        const sourceCode = await this.readSourceFile(sourceFile);
        fileContexts[fileName] = {
          sourceFile,
          sourceCode,
          imports: this.extractImports(sourceCode),
          classes: this.extractClassNames(sourceCode),
          methods: this.extractMethodSignatures(sourceCode)
        };
      }
    }

    // Create comprehensive fix request for Byam
    const byamRequest = {
      type: 'multi_file_changes',
      library: libraryInfo.name,
      oldVersion: libraryInfo.oldVersion,
      newVersion: libraryInfo.newVersion,
      relationshipType: multiFileChange.relationshipType,
      affectedClasses: multiFileChange.context.affectedClasses,
      changeType: multiFileChange.context.changeType,
      fileContexts
    };

    // Send to Byam for LLM analysis
    const byamResponse = await this.sendToByam(byamRequest);

    if (byamResponse.success && byamResponse.fixes) {
      for (const fix of byamResponse.fixes) {
        fixes.push({
          type: 'multi_file_fix',
          description: fix.description,
          file: fix.file,
          changes: fix.changes,
          additionalImports: fix.additionalImports || [],
          removedImports: fix.removedImports || [],
          explanation: fix.explanation,
          confidence: fix.confidence || 0.8,
          coordinatedWith: multiFileChange.files.filter(f => f !== fix.file)
        });
      }
    } else {
      // Fallback to pattern-based fixes
      const patternFixes = await this.generatePatternBasedMultiFileFixes(
        multiFileChange, 
        fileContexts
      );
      fixes.push(...patternFixes);
    }

    return fixes;
  }

  /**
   * Send request to Byam LLM for multi-file analysis
   * @param {Object} request - Byam request
   * @returns {Promise<Object>} - Byam response
   */
  async sendToByam(request) {
    try {
      const { ByamClient } = await import('../byam/byam-client.js');
      const byamClient = new ByamClient(this.context, this.config);

      const prompt = this.buildByamPrompt(request);
      const response = await byamClient.generateFixes({
        type: 'multi_file_changes',
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
    const fileContextsStr = Object.entries(request.fileContexts)
      .map(([fileName, context]) => `
File: ${fileName}
Classes: ${context.classes.join(', ')}
Methods: ${context.methods.slice(0, 10).join(', ')}
Imports: ${context.imports.slice(0, 10).join(', ')}
`)
      .join('\n');

    return `
You are analyzing multi-file changes in a Java project after a library update.

Library: ${request.library}
Version Update: ${request.oldVersion} -> ${request.newVersion}
Relationship Type: ${request.relationshipType}
Affected Classes: ${request.affectedClasses.join(', ')}
Change Type: ${request.changeType}

File Contexts:
${fileContextsStr}

Please analyze the multi-file dependencies and provide coordinated fixes:
1. Identify the root cause of the multi-file issues
2. Generate synchronized fixes for all affected files
3. Ensure method signatures align across files
4. Update imports and dependencies consistently
5. Maintain interface contracts between files

Common multi-file scenarios:
- Interface implementation changes
- Method signature updates across service layers
- DAO/Service coordination for Hibernate updates
- Spring configuration changes affecting multiple beans
- Package restructuring requiring import updates

Return JSON format:
{
  "fixes": [
    {
      "file": "Service.java",
      "description": "Update service method signatures",
      "changes": [
        {
          "lineNumber": 25,
          "oldCode": "old method signature",
          "newCode": "new method signature"
        }
      ],
      "additionalImports": ["import.path.NewClass"],
      "removedImports": ["import.path.OldClass"],
      "explanation": "Updated to match new library interface",
      "confidence": 0.9
    }
  ]
}
`;
  }

  /**
   * Generate pattern-based multi-file fixes as fallback
   * @param {Object} multiFileChange - Multi-file change info
   * @param {Object} fileContexts - File contexts
   * @returns {Promise<Array>} - Pattern-based fixes
   */
  async generatePatternBasedMultiFileFixes(multiFileChange, fileContexts) {
    const fixes = [];
    const affectedClasses = multiFileChange.context.affectedClasses;

    for (const [fileName, context] of Object.entries(fileContexts)) {
      // Generate fixes based on common patterns
      const fileFixes = this.generatePatternBasedFileFixes(
        fileName, 
        context, 
        affectedClasses,
        multiFileChange.relationshipType
      );
      
      fixes.push(...fileFixes);
    }

    return fixes;
  }

  /**
   * Generate pattern-based fixes for a single file
   * @param {string} fileName - File name
   * @param {Object} context - File context
   * @param {Array} affectedClasses - Affected classes
   * @param {string} relationshipType - Relationship type
   * @returns {Array} - File fixes
   */
  generatePatternBasedFileFixes(fileName, context, affectedClasses, relationshipType) {
    const fixes = [];
    const lines = context.sourceCode.split('\n');

    // Common patterns for multi-file fixes
    const patterns = {
      'service-dao': [
        { old: 'Session session', new: 'EntityManager entityManager' },
        { old: 'session.save(', new: 'entityManager.persist(' },
        { old: 'session.get(', new: 'entityManager.find(' }
      ],
      'interface-implementation': [
        { old: 'public void method(String param)', new: 'public void method(String param, Context context)' },
        { old: 'return processData(data)', new: 'return processData(data, defaultContext)' }
      ],
      'spring-configuration': [
        { old: '@Autowired', new: '@Inject' },
        { old: 'WebMvcConfigurerAdapter', new: 'WebMvcConfigurer' }
      ]
    };

    const applicablePatterns = patterns[relationshipType] || patterns['interface-implementation'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of applicablePatterns) {
        if (line.includes(pattern.old)) {
          fixes.push({
            type: 'multi_file_fix',
            description: `Pattern-based fix for ${fileName}`,
            file: fileName,
            changes: [{
              lineNumber: i + 1,
              oldCode: line,
              newCode: line.replace(pattern.old, pattern.new)
            }],
            additionalImports: [],
            removedImports: [],
            explanation: `Pattern-based replacement: ${pattern.old} -> ${pattern.new}`,
            confidence: 0.6,
            coordinatedWith: []
          });
        }
      }
    }

    return fixes;
  }

  /**
   * Apply multi-file fixes in coordinated manner
   * @param {Array} fixes - Array of fixes to apply
   * @returns {Promise<Object>} - Application result
   */
  async applyMultiFileFixes(fixes) {
    this.log.info(`🔧 Applying ${fixes.length} coordinated multi-file fixes`);

    const results = {
      success: true,
      appliedFixes: [],
      failedFixes: [],
      filesModified: new Set()
    };

    // Group fixes by file
    const fixesByFile = new Map();
    for (const fix of fixes) {
      if (!fixesByFile.has(fix.file)) {
        fixesByFile.set(fix.file, []);
      }
      fixesByFile.get(fix.file).push(fix);
    }

    // Apply fixes file by file
    for (const [fileName, fileFixes] of fixesByFile) {
      try {
        const applied = await this.applyFileFixes(fileName, fileFixes);
        if (applied) {
          results.appliedFixes.push(...fileFixes);
          results.filesModified.add(fileName);
        } else {
          results.failedFixes.push(...fileFixes);
          results.success = false;
        }
      } catch (error) {
        this.log.error(`Error applying fixes to ${fileName}: ${error.message}`);
        results.failedFixes.push(...fileFixes);
        results.success = false;
      }
    }

    this.log.info(`✅ Applied fixes to ${results.filesModified.size} files`);
    return results;
  }

  /**
   * Apply fixes to a single file
   * @param {string} fileName - File name
   * @param {Array} fileFixes - Fixes for the file
   * @returns {Promise<boolean>} - Success status
   */
  async applyFileFixes(fileName, fileFixes) {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(fileName, 'utf8');
      let lines = content.split('\n');

      // Sort fixes by line number (descending to avoid line number shifts)
      const sortedFixes = fileFixes.sort((a, b) => {
        const aLine = a.changes[0]?.lineNumber || 0;
        const bLine = b.changes[0]?.lineNumber || 0;
        return bLine - aLine;
      });

      // Apply changes
      for (const fix of sortedFixes) {
        for (const change of fix.changes) {
          if (change.lineNumber && change.lineNumber > 0 && change.lineNumber <= lines.length) {
            lines[change.lineNumber - 1] = change.newCode;
          }
        }
      }

      // Update imports
      let updatedContent = lines.join('\n');
      
      // Collect all import changes
      const allRemovedImports = [];
      const allAdditionalImports = [];
      
      for (const fix of fileFixes) {
        allRemovedImports.push(...(fix.removedImports || []));
        allAdditionalImports.push(...(fix.additionalImports || []));
      }

      // Remove old imports
      if (allRemovedImports.length > 0) {
        updatedContent = this.removeImports(updatedContent, allRemovedImports);
      }
      
      // Add new imports
      if (allAdditionalImports.length > 0) {
        updatedContent = this.addImports(updatedContent, allAdditionalImports);
      }

      await fs.writeFile(fileName, updatedContent, 'utf8');
      this.log.info(`✅ Successfully applied fixes to ${fileName}`);
      return true;

    } catch (error) {
      this.log.error(`❌ Error applying fixes to ${fileName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate multi-file fixes by rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool (maven/gradle)
   * @returns {Promise<Object>} - Validation result
   */
  async validateMultiFileFixes(repoPath, buildTool) {
    this.log.info('🔍 Validating multi-file fixes...');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const buildCommand = buildTool === 'maven' 
        ? 'mvn clean compile test -Dmaven.test.skip=false'
        : './gradlew build';

      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: repoPath,
        timeout: 600000 // 10 minutes for comprehensive build
      });

      // Check if multi-file errors are resolved
      const hasMultiFileErrors = stderr.includes('cannot find symbol') || 
                               stderr.includes('incompatible types') ||
                               stderr.includes('method cannot be applied');

      return {
        success: !hasMultiFileErrors,
        buildLogs: stdout + stderr,
        multiFileErrorsResolved: !hasMultiFileErrors,
        message: hasMultiFileErrors 
          ? 'Some multi-file errors still exist'
          : 'All multi-file errors resolved'
      };

    } catch (error) {
      return {
        success: false,
        buildLogs: error.message,
        error: 'Build failed after applying multi-file fixes'
      };
    }
  }

  // Helper methods
  categorizeError(line) {
    if (line.includes('cannot find symbol')) return 'missing_symbol';
    if (line.includes('incompatible types')) return 'type_mismatch';
    if (line.includes('cannot be applied')) return 'method_signature';
    if (line.includes('package does not exist')) return 'missing_package';
    return 'unknown';
  }

  determineRelationshipType(fileName, relatedFiles, repoPath) {
    // Analyze file names and paths to determine relationship
    if (fileName.includes('Service') && relatedFiles.some(f => f.includes('Dao'))) {
      return 'service-dao';
    }
    if (fileName.includes('Controller') && relatedFiles.some(f => f.includes('Service'))) {
      return 'controller-service';
    }
    if (fileName.includes('Interface') || relatedFiles.some(f => f.includes('Impl'))) {
      return 'interface-implementation';
    }
    if (fileName.includes('Config') || relatedFiles.some(f => f.includes('Config'))) {
      return 'spring-configuration';
    }
    return 'general-dependency';
  }

  determineChangeType(issues) {
    const errorTypes = issues.map(issue => this.categorizeError(issue.line));
    if (errorTypes.includes('method_signature')) return 'method_signature_change';
    if (errorTypes.includes('missing_symbol')) return 'class_or_method_removal';
    if (errorTypes.includes('type_mismatch')) return 'type_change';
    if (errorTypes.includes('missing_package')) return 'package_restructure';
    return 'general_change';
  }

  extractAffectedClasses(fileName, issues) {
    const classes = new Set();
    for (const issue of issues) {
      if (issue.className) {
        classes.add(issue.className);
      }
    }
    return Array.from(classes);
  }

  extractFileFromLine(line) {
    const match = line.match(/([^/\\]+\.java):/);
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

  async findFilesInPackage(packageName, repoPath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [];

    try {
      const packagePath = packageName.replace(/\./g, '/');
      const fullPackagePath = path.join(repoPath, 'src/main/java', packagePath);
      
      const entries = await fs.readdir(fullPackagePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.java')) {
          files.push(path.join(fullPackagePath, entry.name));
        }
      }
    } catch (error) {
      // Package directory doesn't exist or access error
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

  extractImports(sourceCode) {
    return sourceCode.split('\n')
      .filter(line => line.trim().startsWith('import '))
      .map(line => line.trim());
  }

  extractPackageName(sourceCode) {
    const packageLine = sourceCode.split('\n')
      .find(line => line.trim().startsWith('package '));
    
    if (packageLine) {
      const match = packageLine.match(/package\s+([^;]+);/);
      return match ? match[1] : '';
    }
    
    return '';
  }

  extractClassNames(sourceCode) {
    const classNames = [];
    const lines = sourceCode.split('\n');
    
    for (const line of lines) {
      const classMatch = line.match(/(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/);
      const interfaceMatch = line.match(/(?:public|private|protected)?\s*interface\s+(\w+)/);
      
      if (classMatch) classNames.push(classMatch[1]);
      if (interfaceMatch) classNames.push(interfaceMatch[1]);
    }
    
    return classNames;
  }

  extractMethodSignatures(sourceCode) {
    const methods = [];
    const lines = sourceCode.split('\n');
    
    for (const line of lines) {
      const methodMatch = line.match(/(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>[\]]+\s+(\w+)\s*\([^)]*\)/);
      if (methodMatch) {
        methods.push(methodMatch[1]);
      }
    }
    
    return methods;
  }

  getRelativeFileName(fullPath, repoPath) {
    const path = require('path');
    try {
      const relativePath = path.relative(repoPath, fullPath);
      return relativePath.replace(/\\/g, '/'); // Normalize path separators
    } catch (error) {
      return null;
    }
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