import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Java Dependency Checker Service
 * 
 * Checks for outdated Java dependencies using Maven and Gradle tools.
 * Supports multiple build tools and provides comprehensive dependency analysis.
 * 
 * Design Patterns Used:
 * - Strategy Pattern: Different strategies for Maven vs Gradle
 * - Factory Pattern: Creates appropriate checker based on build tool
 * - Adapter Pattern: Normalizes output from different tools
 */
export class JavaDependencyChecker {
  constructor(context, config = {}) {
    this.context = context;
    this.log = context.log;
    this.config = {
      mavenTimeout: 300000, // 5 minutes
      gradleTimeout: 300000, // 5 minutes
      maxConcurrentChecks: 3,
      ...config
    };
  }

  /**
   * Main entry point for checking outdated dependencies
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<Object>} - Dependency analysis result
   */
  async checkOutdatedDependencies(repoPath) {
    this.log.info(`🔍 Starting Java dependency check for: ${repoPath}`);

    try {
      // Step 1: Detect build tool
      const buildTool = await this.detectBuildTool(repoPath);
      this.log.info(`🔧 Detected build tool: ${buildTool}`);

      if (!buildTool) {
        return {
          success: false,
          error: 'No supported build tool detected (Maven or Gradle)'
        };
      }

      // Step 2: Check for outdated dependencies
      const outdatedDeps = await this.checkDependencies(repoPath, buildTool);

      // Step 3: Generate comprehensive report
      const report = this.generateReport(outdatedDeps, buildTool);

      this.log.info(`✅ Dependency check completed. Found ${outdatedDeps.length} outdated dependencies`);

      return {
        success: true,
        buildTool,
        outdatedDependencies: outdatedDeps,
        report
      };

    } catch (error) {
      this.log.error(`❌ Error checking dependencies: ${error.message}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect the build tool used in the project
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<string|null>} - Build tool name or null
   */
  async detectBuildTool(repoPath) {
    try {
      const files = await fs.readdir(repoPath);
      
      if (files.includes('pom.xml')) {
        return 'maven';
      }
      
      if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
        return 'gradle';
      }
      
      // Check for Gradle wrapper
      if (files.includes('gradlew') || files.includes('gradlew.bat')) {
        return 'gradle';
      }

      return null;
    } catch (error) {
      this.log.error(`Error detecting build tool: ${error.message}`);
      return null;
    }
  }

  /**
   * Check for outdated dependencies using the appropriate tool
   * @param {string} repoPath - Path to the repository
   * @param {string} buildTool - Build tool name
   * @returns {Promise<Array>} - Array of outdated dependencies
   */
  async checkDependencies(repoPath, buildTool) {
    switch (buildTool) {
      case 'maven':
        return await this.checkMavenDependencies(repoPath);
      case 'gradle':
        return await this.checkGradleDependencies(repoPath);
      default:
        throw new Error(`Unsupported build tool: ${buildTool}`);
    }
  }

  /**
   * Check Maven dependencies using Maven Versions Plugin
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<Array>} - Array of outdated dependencies
   */
  async checkMavenDependencies(repoPath) {
    this.log.info(`🔍 Checking Maven dependencies...`);

    try {
      // Use Maven Versions Plugin to check for outdated dependencies
      const { stdout, stderr } = await execAsync(
        'mvn versions:display-dependency-updates -Dmaven.test.skip=true',
        {
          cwd: repoPath,
          timeout: this.config.mavenTimeout
        }
      );

      if (stderr && !stderr.includes('BUILD SUCCESS')) {
        this.log.warn(`Maven warnings: ${stderr}`);
      }

      return this.parseMavenVersionsOutput(stdout);

    } catch (error) {
      this.log.error(`Error checking Maven dependencies: ${error.message}`);
      
      // Fallback: try to parse pom.xml directly
      return await this.parsePomXmlDependencies(repoPath);
    }
  }

  /**
   * Check Gradle dependencies using Gradle Versions Plugin
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<Array>} - Array of outdated dependencies
   */
  async checkGradleDependencies(repoPath) {
    this.log.info(`🔍 Checking Gradle dependencies...`);

    try {
      // First, check if Gradle Versions Plugin is available
      const hasVersionsPlugin = await this.checkGradleVersionsPlugin(repoPath);
      
      if (hasVersionsPlugin) {
        const { stdout, stderr } = await execAsync(
          './gradlew dependencyUpdates',
          {
            cwd: repoPath,
            timeout: this.config.gradleTimeout
          }
        );

        if (stderr && !stderr.includes('BUILD SUCCESSFUL')) {
          this.log.warn(`Gradle warnings: ${stderr}`);
        }

        return this.parseGradleVersionsOutput(stdout);
      } else {
        // Fallback: parse build.gradle directly
        return await this.parseGradleDependencies(repoPath);
      }

    } catch (error) {
      this.log.error(`Error checking Gradle dependencies: ${error.message}`);
      
      // Fallback: try to parse build.gradle directly
      return await this.parseGradleDependencies(repoPath);
    }
  }

  /**
   * Check if Gradle Versions Plugin is available
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<boolean>} - Whether the plugin is available
   */
  async checkGradleVersionsPlugin(repoPath) {
    try {
      const buildGradlePath = path.join(repoPath, 'build.gradle');
      const buildGradleContent = await fs.readFile(buildGradlePath, 'utf8');
      
      return buildGradleContent.includes('com.github.ben-manes.versions') ||
             buildGradleContent.includes('gradle-versions-plugin');
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse Maven Versions Plugin output
   * @param {string} output - Maven output
   * @returns {Array} - Array of outdated dependencies
   */
  parseMavenVersionsOutput(output) {
    const dependencies = [];
    const lines = output.split('\n');
    
    let currentGroup = null;

    for (const line of lines) {
      // Look for dependency group headers
      const groupMatch = line.match(/^\[INFO\] The following dependencies in ([^:]+) have newer versions:$/);
      if (groupMatch) {
        currentGroup = groupMatch[1].toLowerCase();
        continue;
      }

      // Look for dependency update information
      // Format: [INFO]   groupId:artifactId ....................... currentVersion -> latestVersion
      const artifactMatch = line.match(/^\[INFO\]\s+([^:]+):([^\s]+)\s+[.\s]*([^\s]+)\s+->\s+([^\s]+)$/);
      if (artifactMatch) {
        dependencies.push({
          groupId: artifactMatch[1],
          artifactId: artifactMatch[2],
          currentVersion: artifactMatch[3].trim(),
          latestVersion: artifactMatch[4].trim(),
          scope: currentGroup || 'unknown',
          type: 'outdated'
        });
      }
    }

    return dependencies;
  }

  /**
   * Parse Gradle Versions Plugin output
   * @param {string} output - Gradle output
   * @returns {Array} - Array of outdated dependencies
   */
  parseGradleVersionsOutput(output) {
    const dependencies = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Look for dependency update information
      const match = line.match(/^(\S+):(\S+)\s+\[([^\]]+)\s+->\s+([^\]]+)\]$/);
      if (match) {
        dependencies.push({
          groupId: match[1],
          artifactId: match[2],
          currentVersion: match[3].trim(),
          latestVersion: match[4].trim(),
          scope: 'implementation', // Default scope
          type: 'outdated'
        });
      }
    }

    return dependencies;
  }

  /**
   * Parse pom.xml directly for dependencies
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<Array>} - Array of dependencies
   */
  async parsePomXmlDependencies(repoPath) {
    try {
      const pomPath = path.join(repoPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf8');
      
      const dependencies = [];
      
      // Simple XML parsing for dependencies
      const depMatches = pomContent.match(/<dependency>[\s\S]*?<\/dependency>/g);
      
      if (depMatches) {
        for (const depMatch of depMatches) {
          const groupIdMatch = depMatch.match(/<groupId>([^<]+)<\/groupId>/);
          const artifactIdMatch = depMatch.match(/<artifactId>([^<]+)<\/artifactId>/);
          const versionMatch = depMatch.match(/<version>([^<]+)<\/version>/);
          
          if (groupIdMatch && artifactIdMatch && versionMatch) {
            dependencies.push({
              groupId: groupIdMatch[1],
              artifactId: artifactIdMatch[1],
              currentVersion: versionMatch[1],
              latestVersion: null, // Would need to check Maven Central
              scope: 'compile',
              type: 'current'
            });
          }
        }
      }
      
      return dependencies;
    } catch (error) {
      this.log.error(`Error parsing pom.xml: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse build.gradle directly for dependencies
   * @param {string} repoPath - Path to the repository
   * @returns {Promise<Array>} - Array of dependencies
   */
  async parseGradleDependencies(repoPath) {
    try {
      const buildGradlePath = path.join(repoPath, 'build.gradle');
      const buildGradleContent = await fs.readFile(buildGradlePath, 'utf8');
      
      const dependencies = [];
      
      // Simple parsing for Gradle dependencies
      const depMatches = buildGradleContent.match(/implementation\s+['"]([^'"]+)['"]/g);
      
      if (depMatches) {
        for (const depMatch of depMatches) {
          const match = depMatch.match(/implementation\s+['"]([^'"]+)['"]/);
          if (match) {
            const depString = match[1];
            const parts = depString.split(':');
            
            if (parts.length >= 2) {
              dependencies.push({
                groupId: parts[0],
                artifactId: parts[1],
                currentVersion: parts[2] || 'latest',
                latestVersion: null, // Would need to check Maven Central
                scope: 'implementation',
                type: 'current'
              });
            }
          }
        }
      }
      
      return dependencies;
    } catch (error) {
      this.log.error(`Error parsing build.gradle: ${error.message}`);
      return [];
    }
  }



  /**
   * Generate comprehensive dependency report
   * @param {Array} outdatedDeps - Outdated dependencies
   * @param {string} buildTool - Build tool name
   * @returns {Object} - Comprehensive report
   */
  generateReport(outdatedDeps, buildTool) {
    const report = {
      summary: {
        totalDependencies: outdatedDeps.length,
        outdatedCount: outdatedDeps.filter(d => d.type === 'outdated').length,
        buildTool
      },
      outdatedDependencies: outdatedDeps.filter(d => d.type === 'outdated'),
      recommendations: this.generateRecommendations(outdatedDeps),
      timestamp: new Date().toISOString()
    };

    return report;
  }

  /**
   * Generate recommendations based on findings
   * @param {Array} outdatedDeps - Outdated dependencies
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(outdatedDeps) {
    const recommendations = [];

    if (outdatedDeps.length > 0) {
      recommendations.push({
        type: 'dependency_update',
        priority: 'medium',
        description: `Update ${outdatedDeps.length} outdated dependencies`,
        action: 'Run dependency update command and test thoroughly'
      });
    }

    if (outdatedDeps.length === 0) {
      recommendations.push({
        type: 'maintenance',
        priority: 'low',
        description: 'Dependencies are up to date',
        action: 'Continue regular dependency monitoring'
      });
    }

    return recommendations;
  }

  /**
   * Get dependency update commands for the detected build tool
   * @param {string} buildTool - Build tool name
   * @returns {Object} - Update commands
   */
  getUpdateCommands(buildTool) {
    switch (buildTool) {
      case 'maven':
        return {
          check: 'mvn versions:display-dependency-updates',
          update: 'mvn versions:use-latest-versions',
          updateReleases: 'mvn versions:use-latest-releases',
          updateNextReleases: 'mvn versions:use-next-releases'
        };
      case 'gradle':
        return {
          check: './gradlew dependencyUpdates',
          update: './gradlew useLatestVersions',
          updateReleases: './gradlew useLatestReleases'
        };
      default:
        return {};
    }
  }
} 