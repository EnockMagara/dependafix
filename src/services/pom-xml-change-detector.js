/**
 * Service for detecting and analyzing pom.xml changes in pull requests
 */
export class PomXmlChangeDetector {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Detect pom.xml changes in a pull request
   * @param {Object} pullRequest - The pull request object
   * @returns {Object} - Analysis result with change details
   */
  async detectPomXmlChanges(pullRequest) {
    const { repository } = this.context.payload;
    
    try {
      // Get files changed in the pull request
      const filesResponse = await this.octokit.rest.pulls.listFiles({
        owner: repository.owner.login,
        repo: repository.name,
        pull_number: pullRequest.number
      });

      const pomXmlFiles = filesResponse.data.filter(file => 
        file.filename === 'pom.xml' || 
        file.filename.endsWith('/pom.xml')
      );

      if (pomXmlFiles.length === 0) {
        return {
          hasChanges: false,
          files: [],
          summary: 'No pom.xml files modified',
          changes: []
        };
      }

      // Analyze each pom.xml file change
      const changes = [];
      for (const file of pomXmlFiles) {
        const fileChanges = await this.analyzePomXmlFileChanges(file, pullRequest);
        changes.push(...fileChanges);
      }

      const summary = this.generateChangeSummary(changes);
      
      this.log.info(`📦 Detected ${changes.length} pom.xml changes in PR #${pullRequest.number}`);
      
      return {
        hasChanges: true,
        files: pomXmlFiles,
        summary,
        changes,
        dependencyChanges: this.extractDependencyChanges(changes),
        buildChanges: this.extractBuildChanges(changes)
      };

    } catch (error) {
      this.log.error(`Error detecting pom.xml changes: ${error.message}`);
      return {
        hasChanges: false,
        error: error.message,
        files: [],
        summary: 'Error analyzing pom.xml changes',
        changes: []
      };
    }
  }

  /**
   * Analyze changes in a specific pom.xml file
   * @param {Object} file - File change information
   * @param {Object} pullRequest - The pull request object
   * @returns {Array} - Array of detected changes
   */
  async analyzePomXmlFileChanges(file, pullRequest) {
    const changes = [];
    const { repository } = this.context.payload;

    try {
      // Get the diff content
      const diffContent = file.patch || '';
      
      // Parse the diff to extract meaningful changes
      const diffLines = diffContent.split('\n');
      let currentSection = '';
      let currentDependency = null;

      for (const line of diffLines) {
        // Track section changes
        if (line.startsWith('@@')) {
          currentSection = this.extractSectionFromDiff(line);
          continue;
        }

        // Detect dependency changes
        if (line.includes('<dependency>') || line.includes('</dependency>')) {
          currentDependency = this.parseDependencyFromDiff(diffLines, diffLines.indexOf(line));
          if (currentDependency) {
            changes.push({
              type: 'dependency_change',
              section: currentSection,
              dependency: currentDependency,
              file: file.filename,
              status: file.status
            });
          }
        }

        // Detect version changes
        if (line.includes('<version>') && line.includes('</version>')) {
          const versionChange = this.parseVersionChange(line);
          if (versionChange) {
            changes.push({
              type: 'version_change',
              section: currentSection,
              ...versionChange,
              file: file.filename,
              status: file.status
            });
          }
        }

        // Detect plugin changes
        if (line.includes('<plugin>') || line.includes('</plugin>')) {
          const pluginChange = this.parsePluginChange(diffLines, diffLines.indexOf(line));
          if (pluginChange) {
            changes.push({
              type: 'plugin_change',
              section: currentSection,
              ...pluginChange,
              file: file.filename,
              status: file.status
            });
          }
        }

        // Detect build configuration changes
        if (line.includes('<build>') || line.includes('</build>') ||
            line.includes('<properties>') || line.includes('</properties>')) {
          changes.push({
            type: 'build_config_change',
            section: currentSection,
            element: this.extractElementName(line),
            file: file.filename,
            status: file.status
          });
        }
      }

    } catch (error) {
      this.log.error(`Error analyzing pom.xml file changes: ${error.message}`);
    }

    return changes;
  }

  /**
   * Extract section name from diff line
   * @param {string} diffLine - Diff line starting with @@
   * @returns {string} - Section name
   */
  extractSectionFromDiff(diffLine) {
    // Extract context from diff line
    const contextMatch = diffLine.match(/@@.*?@@\s*(.*)/);
    return contextMatch ? contextMatch[1].trim() : 'unknown';
  }

  /**
   * Parse dependency information from diff lines
   * @param {Array} diffLines - Array of diff lines
   * @param {number} startIndex - Starting index for parsing
   * @returns {Object|null} - Parsed dependency or null
   */
  parseDependencyFromDiff(diffLines, startIndex) {
    try {
      let groupId = '';
      let artifactId = '';
      let version = '';
      let scope = '';

      // Look for dependency elements in the next few lines
      for (let i = startIndex; i < Math.min(startIndex + 10, diffLines.length); i++) {
        const line = diffLines[i];
        
        if (line.includes('<groupId>')) {
          groupId = this.extractXmlValue(line);
        } else if (line.includes('<artifactId>')) {
          artifactId = this.extractXmlValue(line);
        } else if (line.includes('<version>')) {
          version = this.extractXmlValue(line);
        } else if (line.includes('<scope>')) {
          scope = this.extractXmlValue(line);
        } else if (line.includes('</dependency>')) {
          break;
        }
      }

      if (groupId && artifactId) {
        return { groupId, artifactId, version, scope };
      }
    } catch (error) {
      this.log.warn(`Error parsing dependency from diff: ${error.message}`);
    }

    return null;
  }

  /**
   * Parse version change from diff line
   * @param {string} line - Diff line containing version
   * @returns {Object|null} - Version change information
   */
  parseVersionChange(line) {
    try {
      const versionMatch = line.match(/<version>(.*?)<\/version>/);
      if (versionMatch) {
        const version = versionMatch[1];
        const isAddition = line.startsWith('+');
        const isDeletion = line.startsWith('-');
        
        return {
          version,
          changeType: isAddition ? 'added' : isDeletion ? 'removed' : 'modified'
        };
      }
    } catch (error) {
      this.log.warn(`Error parsing version change: ${error.message}`);
    }

    return null;
  }

  /**
   * Parse plugin change from diff lines
   * @param {Array} diffLines - Array of diff lines
   * @param {number} startIndex - Starting index for parsing
   * @returns {Object|null} - Parsed plugin change or null
   */
  parsePluginChange(diffLines, startIndex) {
    try {
      let groupId = '';
      let artifactId = '';
      let version = '';

      for (let i = startIndex; i < Math.min(startIndex + 10, diffLines.length); i++) {
        const line = diffLines[i];
        
        if (line.includes('<groupId>')) {
          groupId = this.extractXmlValue(line);
        } else if (line.includes('<artifactId>')) {
          artifactId = this.extractXmlValue(line);
        } else if (line.includes('<version>')) {
          version = this.extractXmlValue(line);
        } else if (line.includes('</plugin>')) {
          break;
        }
      }

      if (artifactId) {
        return { groupId, artifactId, version };
      }
    } catch (error) {
      this.log.warn(`Error parsing plugin change: ${error.message}`);
    }

    return null;
  }

  /**
   * Extract XML value from a line
   * @param {string} line - XML line
   * @returns {string} - Extracted value
   */
  extractXmlValue(line) {
    const match = line.match(/<[^>]+>(.*?)<\/[^>]+>/);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract element name from XML line
   * @param {string} line - XML line
   * @returns {string} - Element name
   */
  extractElementName(line) {
    const match = line.match(/<(\/?)([^>\/\s]+)/);
    return match ? match[2] : 'unknown';
  }

  /**
   * Generate a summary of changes
   * @param {Array} changes - Array of changes
   * @returns {string} - Change summary
   */
  generateChangeSummary(changes) {
    const changeTypes = changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {});

    const parts = [];
    for (const [type, count] of Object.entries(changeTypes)) {
      parts.push(`${count} ${type.replace('_', ' ')}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No specific changes detected';
  }

  /**
   * Extract dependency-specific changes
   * @param {Array} changes - Array of all changes
   * @returns {Array} - Dependency changes only
   */
  extractDependencyChanges(changes) {
    return changes.filter(change => 
      change.type === 'dependency_change' || 
      change.type === 'version_change'
    );
  }

  /**
   * Extract build configuration changes
   * @param {Array} changes - Array of all changes
   * @returns {Array} - Build changes only
   */
  extractBuildChanges(changes) {
    return changes.filter(change => 
      change.type === 'plugin_change' || 
      change.type === 'build_config_change'
    );
  }

  /**
   * Check if changes might cause compilation issues
   * @param {Array} changes - Array of changes
   * @returns {boolean} - True if changes might cause issues
   */
  mightCauseCompilationIssues(changes) {
    const riskyChanges = changes.filter(change => {
      // Version removals or major version changes
      if (change.type === 'version_change' && change.changeType === 'removed') {
        return true;
      }
      
      // Dependency removals
      if (change.type === 'dependency_change' && change.status === 'removed') {
        return true;
      }
      
      // Plugin changes that might affect compilation
      if (change.type === 'plugin_change' && 
          (change.artifactId === 'maven-compiler-plugin' || 
           change.artifactId === 'maven-surefire-plugin')) {
        return true;
      }
      
      return false;
    });

    return riskyChanges.length > 0;
  }
}
