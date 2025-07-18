import { RepositoryManager } from './repository-manager.js';
import { BuildRunner } from './build-runner.js';

/**
 * Fix Validator - Validates generated fixes by rebuilding the project
 * 
 * Design Patterns Used:
 * - Template Method Pattern: Common validation workflow with customizable steps
 * - Strategy Pattern: Different validation strategies for different fix types
 * - Command Pattern: Each fix application is a command that can be undone
 */
export class FixValidator {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = {
      maxValidationAttempts: 3,
      buildTimeout: 300000, // 5 minutes
      ...config
    };
    
    this.repositoryManager = new RepositoryManager(context);
    this.buildRunner = new BuildRunner(context, this.config);
  }

  /**
   * Validate fixes by applying them and rebuilding
   * @param {string} repoPath - Repository path
   * @param {string} buildTool - Build tool
   * @param {Array} fixes - Array of fixes to validate
   * @returns {Promise<Object>} - Validation result
   */
  async validateFixes(repoPath, buildTool, fixes) {
    const validationId = `validation-${Date.now()}`;
    
    try {
      this.log.info(`🔍 Validating ${fixes.length} fixes [${validationId}]`);
      
      const validationResults = [];
      const appliedFixes = [];
      const failedFixes = [];
      
      // Create backup of original state
      const backupBranch = await this.createBackupBranch(repoPath);
      
      for (let i = 0; i < fixes.length; i++) {
        const fix = fixes[i];
        
        try {
          this.log.info(`🔧 Validating fix ${i + 1}/${fixes.length}: ${fix.description || fix.type}`);
          
          // Apply the fix
          const applyResult = await this.applyFix(repoPath, fix);
          
          if (!applyResult.success) {
            failedFixes.push({
              fix,
              error: applyResult.error,
              stage: 'application'
            });
            continue;
          }
          
          // Test the fix by rebuilding
          const buildResult = await this.buildRunner.runBuild(repoPath, buildTool);
          
          if (buildResult.success) {
            this.log.info(`✅ Fix validated successfully`);
            appliedFixes.push({
              ...fix,
              validationResult: 'success',
              appliedFiles: applyResult.appliedFiles
            });
          } else {
            this.log.warn(`❌ Fix validation failed - build still fails`);
            failedFixes.push({
              fix,
              error: 'Build failed after applying fix',
              buildErrors: buildResult.errors,
              stage: 'build'
            });
            
            // Revert the fix
            await this.revertToBackup(repoPath, backupBranch);
          }
          
        } catch (error) {
          this.log.error(`❌ Fix validation error: ${error.message}`);
          failedFixes.push({
            fix,
            error: error.message,
            stage: 'validation'
          });
          
          // Revert to backup on error
          await this.revertToBackup(repoPath, backupBranch);
        }
      }
      
      // Final build test with all successful fixes
      let finalBuildResult = null;
      if (appliedFixes.length > 0) {
        this.log.info(`🔨 Running final build test with ${appliedFixes.length} applied fixes`);
        finalBuildResult = await this.buildRunner.runBuild(repoPath, buildTool);
      }
      
      const result = {
        success: appliedFixes.length > 0,
        validationId,
        appliedFixes,
        failedFixes,
        totalFixes: fixes.length,
        successRate: appliedFixes.length / fixes.length,
        finalBuildSuccess: finalBuildResult?.success || false,
        finalBuildErrors: finalBuildResult?.errors || []
      };
      
      this.log.info(`✅ Validation complete: ${appliedFixes.length}/${fixes.length} fixes applied`);
      return result;
      
    } catch (error) {
      this.log.error(`❌ Fix validation failed [${validationId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply a single fix to the repository
   * @param {string} repoPath - Repository path
   * @param {Object} fix - Fix to apply
   * @returns {Promise<Object>} - Application result
   */
  async applyFix(repoPath, fix) {
    try {
      const appliedFiles = [];
      
      switch (fix.type) {
        case 'code_fix':
          await this.applyCodeFix(repoPath, fix);
          appliedFiles.push(fix.filePath);
          break;
          
        case 'file_modification':
          await this.applyFileModification(repoPath, fix);
          appliedFiles.push(fix.filePath);
          break;
          
        case 'dependency_update':
          await this.applyDependencyUpdate(repoPath, fix);
          appliedFiles.push('pom.xml', 'build.gradle', 'build.gradle.kts');
          break;
          
        case 'import_fix':
          await this.applyImportFix(repoPath, fix);
          appliedFiles.push(fix.filePath);
          break;
          
        default:
          throw new Error(`Unsupported fix type: ${fix.type}`);
      }
      
      return {
        success: true,
        appliedFiles: appliedFiles.filter(file => file) // Remove null/undefined
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply code fix to a file
   * @param {string} repoPath - Repository path
   * @param {Object} fix - Code fix
   */
  async applyCodeFix(repoPath, fix) {
    if (!fix.filePath || !fix.content) {
      throw new Error('Code fix requires filePath and content');
    }
    
    // Write the fixed content to the file
    await this.repositoryManager.writeFileContent(repoPath, fix.filePath, fix.content);
    this.log.info(`✅ Applied code fix to ${fix.filePath}`);
  }

  /**
   * Apply file modification
   * @param {string} repoPath - Repository path
   * @param {Object} fix - File modification fix
   */
  async applyFileModification(repoPath, fix) {
    if (!fix.filePath) {
      throw new Error('File modification requires filePath');
    }
    
    // Read current file content
    const currentContent = await this.repositoryManager.getFileContent(repoPath, fix.filePath);
    
    if (!currentContent) {
      throw new Error(`File not found: ${fix.filePath}`);
    }
    
    // Apply modifications based on fix instructions
    let modifiedContent = currentContent;
    
    if (fix.replacements) {
      for (const replacement of fix.replacements) {
        modifiedContent = modifiedContent.replace(
          new RegExp(replacement.pattern, replacement.flags || 'g'),
          replacement.replacement
        );
      }
    }
    
    if (fix.additions) {
      for (const addition of fix.additions) {
        if (addition.position === 'end') {
          modifiedContent += '\n' + addition.content;
        } else if (addition.position === 'start') {
          modifiedContent = addition.content + '\n' + modifiedContent;
        }
      }
    }
    
    // Write modified content
    await this.repositoryManager.writeFileContent(repoPath, fix.filePath, modifiedContent);
    this.log.info(`✅ Applied file modification to ${fix.filePath}`);
  }

  /**
   * Apply dependency update
   * @param {string} repoPath - Repository path
   * @param {Object} fix - Dependency update fix
   */
  async applyDependencyUpdate(repoPath, fix) {
    // Check for Maven pom.xml
    if (await this.repositoryManager.fileExists(repoPath, 'pom.xml')) {
      await this.applyMavenDependencyUpdate(repoPath, fix);
    }
    
    // Check for Gradle build files
    const gradleFiles = ['build.gradle', 'build.gradle.kts'];
    for (const gradleFile of gradleFiles) {
      if (await this.repositoryManager.fileExists(repoPath, gradleFile)) {
        await this.applyGradleDependencyUpdate(repoPath, gradleFile, fix);
      }
    }
  }

  /**
   * Apply Maven dependency update
   * @param {string} repoPath - Repository path
   * @param {Object} fix - Dependency fix
   */
  async applyMavenDependencyUpdate(repoPath, fix) {
    const pomContent = await this.repositoryManager.getFileContent(repoPath, 'pom.xml');
    
    if (!pomContent) {
      throw new Error('pom.xml not found');
    }
    
    let modifiedPom = pomContent;
    
    if (fix.dependencyUpdates) {
      for (const update of fix.dependencyUpdates) {
        // Update version in pom.xml
        const versionPattern = new RegExp(
          `(<groupId>${update.groupId}</groupId>\\s*<artifactId>${update.artifactId}</artifactId>\\s*<version>)[^<]+(</version>)`,
          'g'
        );
        
        modifiedPom = modifiedPom.replace(versionPattern, `$1${update.newVersion}$2`);
      }
    }
    
    await this.repositoryManager.writeFileContent(repoPath, 'pom.xml', modifiedPom);
    this.log.info(`✅ Applied Maven dependency updates to pom.xml`);
  }

  /**
   * Apply Gradle dependency update
   * @param {string} repoPath - Repository path
   * @param {string} gradleFile - Gradle file name
   * @param {Object} fix - Dependency fix
   */
  async applyGradleDependencyUpdate(repoPath, gradleFile, fix) {
    const gradleContent = await this.repositoryManager.getFileContent(repoPath, gradleFile);
    
    if (!gradleContent) {
      throw new Error(`${gradleFile} not found`);
    }
    
    let modifiedGradle = gradleContent;
    
    if (fix.dependencyUpdates) {
      for (const update of fix.dependencyUpdates) {
        // Update version in build.gradle
        const versionPattern = new RegExp(
          `(['"]${update.groupId}:${update.artifactId}:)[^'"]+(['"])`,
          'g'
        );
        
        modifiedGradle = modifiedGradle.replace(versionPattern, `$1${update.newVersion}$2`);
      }
    }
    
    await this.repositoryManager.writeFileContent(repoPath, gradleFile, modifiedGradle);
    this.log.info(`✅ Applied Gradle dependency updates to ${gradleFile}`);
  }

  /**
   * Apply import fix
   * @param {string} repoPath - Repository path
   * @param {Object} fix - Import fix
   */
  async applyImportFix(repoPath, fix) {
    if (!fix.filePath) {
      throw new Error('Import fix requires filePath');
    }
    
    const fileContent = await this.repositoryManager.getFileContent(repoPath, fix.filePath);
    
    if (!fileContent) {
      throw new Error(`File not found: ${fix.filePath}`);
    }
    
    let modifiedContent = fileContent;
    
    // Add new imports
    if (fix.addImports) {
      const importSection = this.findImportSection(fileContent);
      const newImports = fix.addImports.map(imp => `import ${imp};`).join('\n');
      
      if (importSection.found) {
        modifiedContent = fileContent.replace(
          importSection.lastImport,
          importSection.lastImport + '\n' + newImports
        );
      } else {
        // Add imports after package declaration
        const packageMatch = fileContent.match(/package\s+[^;]+;/);
        if (packageMatch) {
          modifiedContent = fileContent.replace(
            packageMatch[0],
            packageMatch[0] + '\n\n' + newImports
          );
        }
      }
    }
    
    // Remove old imports
    if (fix.removeImports) {
      for (const importToRemove of fix.removeImports) {
        const importPattern = new RegExp(`import\\s+${importToRemove.replace(/\./g, '\\.')}\\s*;\\s*\n?`, 'g');
        modifiedContent = modifiedContent.replace(importPattern, '');
      }
    }
    
    await this.repositoryManager.writeFileContent(repoPath, fix.filePath, modifiedContent);
    this.log.info(`✅ Applied import fix to ${fix.filePath}`);
  }

  /**
   * Find import section in Java file
   * @param {string} content - File content
   * @returns {Object} - Import section info
   */
  findImportSection(content) {
    const importLines = content.match(/import\s+[^;]+;/g);
    
    if (!importLines || importLines.length === 0) {
      return { found: false };
    }
    
    const lastImport = importLines[importLines.length - 1];
    return {
      found: true,
      lastImport,
      count: importLines.length
    };
  }

  /**
   * Create backup branch
   * @param {string} repoPath - Repository path
   * @returns {Promise<string>} - Backup branch name
   */
  async createBackupBranch(repoPath) {
    const backupBranch = `backup-${Date.now()}`;
    await this.repositoryManager.createFixBranch(repoPath, backupBranch);
    
    // Switch back to original branch
    await this.repositoryManager.executeGitCommand(['checkout', '-'], repoPath);
    
    return backupBranch;
  }

  /**
   * Revert to backup branch
   * @param {string} repoPath - Repository path
   * @param {string} backupBranch - Backup branch name
   */
  async revertToBackup(repoPath, backupBranch) {
    try {
      await this.repositoryManager.executeGitCommand(['reset', '--hard', backupBranch], repoPath);
      this.log.info(`🔄 Reverted to backup: ${backupBranch}`);
    } catch (error) {
      this.log.error(`❌ Failed to revert to backup: ${error.message}`);
    }
  }
} 