/**
 * Context Extractor Service
 * Extracts API diffs and dependency information for context payload
 */
export class ContextExtractor {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Extract API diffs from recent commits
   * @returns {Array} - Array of API diffs
   */
  async extractAPIDiffs() {
    const { repository } = this.context.payload;
    this.log.info(`🔍 Extracting API diffs for ${repository.full_name}`);
    
    const apiDiffs = [];

    try {
      // Get recent commits
      const commits = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });

      for (const commit of commits.data) {
        const commitDiffs = await this.extractCommitDiffs(commit);
        apiDiffs.push(...commitDiffs);
      }

    } catch (error) {
      this.log.error(`Error extracting API diffs: ${error.message}`);
    }

    return apiDiffs;
  }

  /**
   * Extract diffs from a specific commit
   * @param {Object} commit - Commit object
   * @returns {Array} - Array of diffs
   */
  async extractCommitDiffs(commit) {
    const { repository } = this.context.payload;
    const diffs = [];

    try {
      const commitDetails = await this.octokit.rest.repos.getCommit({
        owner: repository.owner.login,
        repo: repository.name,
        ref: commit.sha
      });

      for (const file of commitDetails.data.files) {
        if (this.isJavaFile(file.filename)) {
          const diff = await this.analyzeFileDiff(file, commit);
          if (diff) {
            diffs.push(diff);
          }
        }
      }

    } catch (error) {
      this.log.warn(`Error extracting diffs from commit ${commit.sha}: ${error.message}`);
    }

    return diffs;
  }

  /**
   * Analyze file diff for API changes
   * @param {Object} file - File change object
   * @param {Object} commit - Commit object
   * @returns {Object|null} - Diff analysis or null
   */
  async analyzeFileDiff(file, commit) {
    if (!file.patch) {
      return null;
    }

    const apiChanges = this.extractAPIChangesFromPatch(file.patch);
    
    if (apiChanges.length === 0) {
      return null;
    }

    return {
      commitSha: commit.sha,
      commitMessage: commit.commit.message,
      commitDate: commit.commit.author.date,
      filePath: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      apiChanges: apiChanges
    };
  }

  /**
   * Extract API changes from patch content
   * @param {string} patch - Git patch content
   * @returns {Array} - Array of API changes
   */
  extractAPIChangesFromPatch(patch) {
    const apiChanges = [];
    const lines = patch.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for method signature changes
      if (line.startsWith('+') || line.startsWith('-')) {
        const methodMatch = line.match(/(public|private|protected)?\s*(static)?\s*(\w+)\s+(\w+)\s*\([^)]*\)/);
        if (methodMatch) {
          const isAddition = line.startsWith('+');
          const isDeletion = line.startsWith('-');
          
          apiChanges.push({
            type: isAddition ? 'method_added' : isDeletion ? 'method_removed' : 'method_modified',
            methodName: methodMatch[4],
            returnType: methodMatch[3],
            visibility: methodMatch[1] || 'package',
            isStatic: !!methodMatch[2],
            line: i + 1,
            content: line.trim()
          });
        }

        // Look for class/interface changes
        const classMatch = line.match(/(public|private|protected)?\s*(class|interface|enum)\s+(\w+)/);
        if (classMatch) {
          const isAddition = line.startsWith('+');
          const isDeletion = line.startsWith('-');
          
          apiChanges.push({
            type: isAddition ? 'class_added' : isDeletion ? 'class_removed' : 'class_modified',
            className: classMatch[3],
            classType: classMatch[2],
            visibility: classMatch[1] || 'package',
            line: i + 1,
            content: line.trim()
          });
        }

        // Look for field changes
        const fieldMatch = line.match(/(public|private|protected)?\s*(static)?\s*(final)?\s*(\w+)\s+(\w+)/);
        if (fieldMatch) {
          const isAddition = line.startsWith('+');
          const isDeletion = line.startsWith('-');
          
          apiChanges.push({
            type: isAddition ? 'field_added' : isDeletion ? 'field_removed' : 'field_modified',
            fieldName: fieldMatch[5],
            fieldType: fieldMatch[4],
            visibility: fieldMatch[1] || 'package',
            isStatic: !!fieldMatch[2],
            isFinal: !!fieldMatch[3],
            line: i + 1,
            content: line.trim()
          });
        }
      }
    }

    return apiChanges;
  }

  /**
   * Check if file is a Java file
   * @param {string} filename - File name
   * @returns {boolean} - True if Java file
   */
  isJavaFile(filename) {
    return filename.endsWith('.java') || filename.endsWith('.xml') || filename.endsWith('.gradle');
  }

  /**
   * Extract dependency information
   * @returns {Object} - Dependency information
   */
  async extractDependencyInfo() {
    const { repository } = this.context.payload;
    this.log.info(`🔍 Extracting dependency info for ${repository.full_name}`);
    
    const dependencyInfo = {
      maven: null,
      gradle: null,
      dependencies: [],
      dependencyChanges: [],
      securityVulnerabilities: []
    };

    try {
      // Extract Maven dependencies
      const pomContent = await this.getFileContent('pom.xml');
      if (pomContent) {
        dependencyInfo.maven = this.extractMavenDependencies(pomContent);
        dependencyInfo.dependencies.push(...dependencyInfo.maven.dependencies);
      }

      // Extract Gradle dependencies
      const gradleContent = await this.getFileContent('build.gradle');
      if (gradleContent) {
        dependencyInfo.gradle = this.extractGradleDependencies(gradleContent);
        dependencyInfo.dependencies.push(...dependencyInfo.gradle.dependencies);
      }

      // Extract dependency changes from recent commits
      dependencyInfo.dependencyChanges = await this.extractDependencyChanges();

      // Check for security vulnerabilities
      dependencyInfo.securityVulnerabilities = await this.checkSecurityVulnerabilities(dependencyInfo.dependencies);

    } catch (error) {
      this.log.error(`Error extracting dependency info: ${error.message}`);
    }

    return dependencyInfo;
  }

  /**
   * Extract Maven dependencies from pom.xml
   * @param {string} content - pom.xml content
   * @returns {Object} - Maven dependency information
   */
  extractMavenDependencies(content) {
    const dependencies = [];
    const properties = {};

    try {
      // Extract properties
      const propertyRegex = /<(\w+)>([^<]+)<\/\1>/g;
      let match;
      
      while ((match = propertyRegex.exec(content)) !== null) {
        properties[match[1]] = match[2];
      }

      // Extract dependencies
      const dependencyRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
      
      while ((match = dependencyRegex.exec(content)) !== null) {
        const groupId = match[1].trim();
        const artifactId = match[2].trim();
        let version = match[3].trim();

        // Resolve property references
        if (version.startsWith('${') && version.endsWith('}')) {
          const propertyName = version.slice(2, -1);
          version = properties[propertyName] || version;
        }

        dependencies.push({
          groupId,
          artifactId,
          version,
          type: 'maven',
          coordinates: `${groupId}:${artifactId}:${version}`
        });
      }

    } catch (error) {
      this.log.error(`Error extracting Maven dependencies: ${error.message}`);
    }

    return {
      buildTool: 'maven',
      dependencies,
      properties
    };
  }

  /**
   * Extract Gradle dependencies from build.gradle
   * @param {string} content - build.gradle content
   * @returns {Object} - Gradle dependency information
   */
  extractGradleDependencies(content) {
    const dependencies = [];

    try {
      // Extract implementation dependencies
      const implementationRegex = /implementation\s+['"]([^:]+):([^:]+):([^'"]+)['"]/g;
      let match;
      
      while ((match = implementationRegex.exec(content)) !== null) {
        const groupId = match[1].trim();
        const artifactId = match[2].trim();
        const version = match[3].trim();

        dependencies.push({
          groupId,
          artifactId,
          version,
          type: 'gradle',
          scope: 'implementation',
          coordinates: `${groupId}:${artifactId}:${version}`
        });
      }

      // Extract testImplementation dependencies
      const testImplementationRegex = /testImplementation\s+['"]([^:]+):([^:]+):([^'"]+)['"]/g;
      
      while ((match = testImplementationRegex.exec(content)) !== null) {
        const groupId = match[1].trim();
        const artifactId = match[2].trim();
        const version = match[3].trim();

        dependencies.push({
          groupId,
          artifactId,
          version,
          type: 'gradle',
          scope: 'testImplementation',
          coordinates: `${groupId}:${artifactId}:${version}`
        });
      }

    } catch (error) {
      this.log.error(`Error extracting Gradle dependencies: ${error.message}`);
    }

    return {
      buildTool: 'gradle',
      dependencies
    };
  }

  /**
   * Extract dependency changes from recent commits
   * @returns {Array} - Array of dependency changes
   */
  async extractDependencyChanges() {
    const { repository } = this.context.payload;
    const changes = [];

    try {
      const commits = await this.octokit.rest.repos.listCommits({
        owner: repository.owner.login,
        repo: repository.name,
        per_page: 10
      });

      for (const commit of commits.data) {
        const commitChanges = await this.extractCommitDependencyChanges(commit);
        changes.push(...commitChanges);
      }

    } catch (error) {
      this.log.error(`Error extracting dependency changes: ${error.message}`);
    }

    return changes;
  }

  /**
   * Extract dependency changes from a specific commit
   * @param {Object} commit - Commit object
   * @returns {Array} - Array of dependency changes
   */
  async extractCommitDependencyChanges(commit) {
    const { repository } = this.context.payload;
    const changes = [];

    try {
      const commitDetails = await this.octokit.rest.repos.getCommit({
        owner: repository.owner.login,
        repo: repository.name,
        ref: commit.sha
      });

      for (const file of commitDetails.data.files) {
        if (this.isDependencyFile(file.filename)) {
          const dependencyChanges = this.analyzeDependencyFileChanges(file, commit);
          changes.push(...dependencyChanges);
        }
      }

    } catch (error) {
      this.log.warn(`Error extracting dependency changes from commit ${commit.sha}: ${error.message}`);
    }

    return changes;
  }

  /**
   * Check if file is a dependency file
   * @param {string} filename - File name
   * @returns {boolean} - True if dependency file
   */
  isDependencyFile(filename) {
    return filename === 'pom.xml' || filename === 'build.gradle' || filename === 'build.gradle.kts';
  }

  /**
   * Analyze dependency file changes
   * @param {Object} file - File change object
   * @param {Object} commit - Commit object
   * @returns {Array} - Array of dependency changes
   */
  analyzeDependencyFileChanges(file, commit) {
    const changes = [];

    if (!file.patch) {
      return changes;
    }

    // Look for version changes in the patch
    const versionChangeRegex = /[-+]\s*<version>([^<]+)<\/version>/g;
    let match;
    
    while ((match = versionChangeRegex.exec(file.patch)) !== null) {
      const isAddition = file.patch.substring(0, match.index).lastIndexOf('+') > file.patch.substring(0, match.index).lastIndexOf('-');
      
      changes.push({
        commitSha: commit.sha,
        commitMessage: commit.commit.message,
        commitDate: commit.commit.author.date,
        filePath: file.filename,
        changeType: isAddition ? 'version_added' : 'version_removed',
        version: match[1],
        line: this.getLineNumberFromPatch(file.patch, match.index)
      });
    }

    return changes;
  }

  /**
   * Get line number from patch index
   * @param {string} patch - Patch content
   * @param {number} index - Character index
   * @returns {number} - Line number
   */
  getLineNumberFromPatch(patch, index) {
    const beforeIndex = patch.substring(0, index);
    const lines = beforeIndex.split('\n');
    return lines.length;
  }

  /**
   * Check for security vulnerabilities in dependencies
   * @param {Array} dependencies - Array of dependencies
   * @returns {Array} - Array of security vulnerabilities
   */
  async checkSecurityVulnerabilities(dependencies) {
    const vulnerabilities = [];

    // For MVP, we'll check for known vulnerable versions
    const knownVulnerabilities = {
      'com.google.guava:guava': {
        '15.0': {
          cveId: 'CVE-2024-22236',
          severity: 'high',
          description: 'Guava 15.0 has known security vulnerabilities'
        }
      },
      'org.apache.commons:commons-lang': {
        '3.0': {
          cveId: 'CVE-2025-48924',
          severity: 'medium',
          description: 'Commons Lang 3.0 has uncontrolled recursion vulnerability'
        }
      },
      'commons-fileupload:commons-fileupload': {
        '1.3.1': {
          cveId: 'CVE-2023-24998',
          severity: 'high',
          description: 'Commons FileUpload 1.3.1 has security vulnerabilities'
        }
      }
    };

    for (const dependency of dependencies) {
      const key = `${dependency.groupId}:${dependency.artifactId}`;
      const versionVulns = knownVulnerabilities[key];
      
      if (versionVulns && versionVulns[dependency.version]) {
        vulnerabilities.push({
          dependency: dependency,
          ...versionVulns[dependency.version]
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Get file content from repository
   * @param {string} filePath - File path
   * @returns {string|null} - File content or null
   */
  async getFileContent(filePath) {
    const { repository } = this.context.payload;
    
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: filePath
      });

      if (response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
