/**
 * Semantic Version Parser for precise version change detection
 */
export class SemanticVersionParser {
  constructor() {
    this.versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  }

  /**
   * Parse semantic version string
   * @param {string} version - Version string
   * @returns {Object} - Parsed version components
   */
  parseSemanticVersion(version) {
    if (!version || typeof version !== 'string') {
      return { major: 0, minor: 0, patch: 0, preRelease: null, build: null };
    }

    const match = version.match(this.versionPattern);
    if (!match) {
      // Handle non-semantic versions (e.g., "1.0", "latest", "SNAPSHOT")
      return {
        major: 0,
        minor: 0,
        patch: 0,
        preRelease: version,
        build: null,
        isSemantic: false
      };
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      preRelease: match[4] || null,
      build: match[5] || null,
      isSemantic: true
    };
  }

  /**
   * Assess version change significance
   * @param {string} oldVersion - Old version string
   * @param {string} newVersion - New version string
   * @returns {Object} - Change significance analysis
   */
  assessSignificance(oldVersion, newVersion) {
    // Handle additions and removals
    if (!oldVersion && newVersion) {
      return { type: 'addition', significance: 'addition', risk: 'medium' };
    }
    if (oldVersion && !newVersion) {
      return { type: 'removal', significance: 'removal', risk: 'high' };
    }
    if (!oldVersion && !newVersion) {
      return { type: 'none', significance: 'none', risk: 'low' };
    }

    const oldParts = this.parseSemanticVersion(oldVersion);
    const newParts = this.parseSemanticVersion(newVersion);

    // Handle non-semantic versions
    if (!oldParts.isSemantic || !newParts.isSemantic) {
      return this.assessNonSemanticChange(oldVersion, newVersion);
    }

    // Compare semantic versions
    if (oldParts.major !== newParts.major) {
      return { type: 'upgrade', significance: 'major', risk: 'high' };
    }
    if (oldParts.minor !== newParts.minor) {
      return { type: 'upgrade', significance: 'minor', risk: 'medium' };
    }
    if (oldParts.patch !== newParts.patch) {
      return { type: 'upgrade', significance: 'patch', risk: 'low' };
    }

    // Handle pre-release changes
    if (oldParts.preRelease !== newParts.preRelease) {
      return { type: 'upgrade', significance: 'pre_release', risk: 'medium' };
    }

    return { type: 'none', significance: 'none', risk: 'low' };
  }

  /**
   * Assess non-semantic version changes
   * @param {string} oldVersion - Old version
   * @param {string} newVersion - New version
   * @returns {Object} - Change analysis
   */
  assessNonSemanticChange(oldVersion, newVersion) {
    // Handle SNAPSHOT changes
    if (oldVersion.includes('SNAPSHOT') || newVersion.includes('SNAPSHOT')) {
      return { type: 'upgrade', significance: 'snapshot', risk: 'medium' };
    }

    // Handle "latest" or dynamic versions
    if (oldVersion === 'latest' || newVersion === 'latest') {
      return { type: 'upgrade', significance: 'dynamic', risk: 'high' };
    }

    // Handle version ranges
    if (oldVersion.includes('[') || newVersion.includes('[') ||
        oldVersion.includes('(') || newVersion.includes('(')) {
      return { type: 'upgrade', significance: 'range', risk: 'medium' };
    }

    // Generic non-semantic change
    return { type: 'upgrade', significance: 'non_semantic', risk: 'medium' };
  }

  /**
   * Extract version information from diff line
   * @param {string} diffLine - Git diff line
   * @returns {Object|null} - Version change information
   */
  extractVersionFromDiff(diffLine) {
    // Match version elements in XML
    const versionMatch = diffLine.match(/<version>(.*?)<\/version>/);
    if (!versionMatch) return null;

    const version = versionMatch[1].trim();
    const isAddition = diffLine.startsWith('+');
    const isDeletion = diffLine.startsWith('-');

    return {
      version,
      isAddition,
      isDeletion,
      isModification: !isAddition && !isDeletion
    };
  }

  /**
   * Parse before/after versions from diff
   * @param {Array} diffLines - Array of diff lines
   * @param {number} versionLineIndex - Index of version line
   * @returns {Object} - Before/after version information
   */
  parseVersionChange(diffLines, versionLineIndex) {
    const currentLine = diffLines[versionLineIndex];
    const versionInfo = this.extractVersionFromDiff(currentLine);
    
    if (!versionInfo) return null;

    let oldVersion = null;
    let newVersion = null;

    if (versionInfo.isAddition) {
      newVersion = versionInfo.version;
    } else if (versionInfo.isDeletion) {
      oldVersion = versionInfo.version;
    } else {
      // For modifications, look for the corresponding addition/deletion
      for (let i = versionLineIndex - 5; i <= versionLineIndex + 5; i++) {
        if (i < 0 || i >= diffLines.length || i === versionLineIndex) continue;
        
        const line = diffLines[i];
        const lineVersionInfo = this.extractVersionFromDiff(line);
        
        if (lineVersionInfo) {
          if (lineVersionInfo.isDeletion) {
            oldVersion = lineVersionInfo.version;
          } else if (lineVersionInfo.isAddition) {
            newVersion = lineVersionInfo.version;
          }
        }
      }
    }

    const significance = this.assessSignificance(oldVersion, newVersion);

    // Only return a change if versions are actually different
    if (oldVersion === newVersion && oldVersion !== null && newVersion !== null) {
      return null; // No actual version change
    }

    return {
      oldVersion,
      newVersion,
      changeType: significance.type,
      significance: significance.significance,
      risk: significance.risk,
      isSemantic: this.parseSemanticVersion(oldVersion || newVersion).isSemantic
    };
  }

  /**
   * Extract element context from diff
   * @param {Array} diffLines - Array of diff lines
   * @param {number} versionLineIndex - Index of version line
   * @returns {Object} - Element context information
   */
  extractElementContext(diffLines, versionLineIndex) {
    let elementType = 'unknown';
    let groupId = '';
    let artifactId = '';
    let scope = '';

    // Look backwards for element context
    for (let i = versionLineIndex; i >= Math.max(0, versionLineIndex - 20); i--) {
      const line = diffLines[i];
      
      if (line.includes('<dependency>')) {
        elementType = 'dependency';
        break;
      } else if (line.includes('<plugin>')) {
        elementType = 'plugin';
        break;
      } else if (line.includes('<parent>')) {
        elementType = 'parent';
        break;
      } else if (line.includes('<properties>')) {
        elementType = 'property';
        break;
      }
    }

    // Extract groupId and artifactId
    for (let i = versionLineIndex - 10; i <= versionLineIndex + 10; i++) {
      if (i < 0 || i >= diffLines.length) continue;
      
      const line = diffLines[i];
      
      if (line.includes('<groupId>')) {
        groupId = this.extractXmlValue(line);
      } else if (line.includes('<artifactId>')) {
        artifactId = this.extractXmlValue(line);
      } else if (line.includes('<scope>')) {
        scope = this.extractXmlValue(line);
      }
    }

    return {
      elementType,
      groupId,
      artifactId,
      scope,
      fullName: groupId && artifactId ? `${groupId}:${artifactId}` : ''
    };
  }

  /**
   * Extract XML value from line
   * @param {string} line - XML line
   * @returns {string} - Extracted value
   */
  extractXmlValue(line) {
    const match = line.match(/<[^>]+>(.*?)<\/[^>]+>/);
    return match ? match[1].trim() : '';
  }

  /**
   * Check if version change is significant based on configuration
   * @param {Object} versionChange - Version change information
   * @param {Object} config - Configuration options
   * @returns {boolean} - True if change is significant
   */
  isSignificantChange(versionChange, config = {}) {
    const { minSignificance = 'minor', ignoredDependencies = [] } = config;
    
    // Check if dependency is ignored
    if (versionChange.context && versionChange.context.fullName) {
      if (ignoredDependencies.includes(versionChange.context.fullName)) {
        return false;
      }
    }

    // Check significance level
    const significanceLevels = {
      'patch': 1,
      'minor': 2,
      'major': 3,
      'removal': 4,
      'addition': 2
    };

    const changeLevel = significanceLevels[versionChange.significance] || 0;
    const minLevel = significanceLevels[minSignificance] || 0;

    return changeLevel >= minLevel;
  }
}
