/**
 * Service for detecting breaking changes in Java dependencies using external APIs
 * Integrates multiple APIs for comprehensive breaking change detection
 */
export class DependencyBreakingChangeAPI {
  constructor() {
    this.mavenCentralBaseUrl = 'https://search.maven.org/solrsearch/select';
    this.librariesIOBaseUrl = 'https://libraries.io/api';
    this.nvdBaseUrl = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
  }

  /**
   * Detect breaking changes for a specific dependency
   * @param {string} groupId - Maven group ID
   * @param {string} artifactId - Maven artifact ID
   * @param {string} currentVersion - Current version
   * @param {string} targetVersion - Target version to check
   * @returns {Object} - Breaking change analysis
   */
  async detectBreakingChanges(groupId, artifactId, currentVersion, targetVersion) {
    const results = {
      hasBreakingChanges: false,
      confidence: 0,
      breakingChanges: [],
      securityVulnerabilities: [],
      apiChanges: [],
      recommendations: []
    };

    try {
      // Check multiple sources for breaking changes
      const [
        mavenCentralData,
        librariesIOData,
        securityData,
        changelogData
      ] = await Promise.all([
        this.checkMavenCentral(groupId, artifactId, currentVersion, targetVersion),
        this.checkLibrariesIO(groupId, artifactId, currentVersion, targetVersion),
        this.checkSecurityVulnerabilities(groupId, artifactId, currentVersion),
        this.checkChangelog(groupId, artifactId, currentVersion, targetVersion)
      ]);

      // Combine results
      results.breakingChanges.push(...mavenCentralData.breakingChanges);
      results.breakingChanges.push(...librariesIOData.breakingChanges);
      results.securityVulnerabilities.push(...securityData.vulnerabilities);
      results.apiChanges.push(...changelogData.apiChanges);

      // Calculate confidence based on findings
      results.confidence = this.calculateConfidence(results);
      results.hasBreakingChanges = results.confidence > 70;

      // Generate recommendations
      results.recommendations = this.generateRecommendations(results);

    } catch (error) {
      console.error(`Error detecting breaking changes: ${error.message}`);
    }

    return results;
  }

  /**
   * Check Maven Central for dependency information
   * @param {string} groupId - Maven group ID
   * @param {string} artifactId - Maven artifact ID
   * @param {string} currentVersion - Current version
   * @param {string} targetVersion - Target version
   * @returns {Object} - Maven Central analysis
   */
  async checkMavenCentral(groupId, artifactId, currentVersion, targetVersion) {
    const breakingChanges = [];

    try {
      // Get all versions
      const response = await fetch(
        `${this.mavenCentralBaseUrl}?q=g:${groupId}+AND+a:${artifactId}&rows=100&wt=json`
      );
      
      if (!response.ok) {
        throw new Error(`Maven Central API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.response && data.response.docs) {
        const versions = data.response.docs
          .map(doc => doc.v)
          .filter(v => v)
          .sort((a, b) => this.compareVersions(a, b));

        // Check if target version exists
        const targetVersionExists = versions.includes(targetVersion);
        if (!targetVersionExists) {
          breakingChanges.push({
            type: 'version_not_found',
            message: `Target version ${targetVersion} not found in Maven Central`,
            confidence: 95,
            severity: 'high'
          });
        }

        // Check for major version jumps (potential breaking changes)
        const currentMajor = this.getMajorVersion(currentVersion);
        const targetMajor = this.getMajorVersion(targetVersion);
        
        if (targetMajor > currentMajor) {
          breakingChanges.push({
            type: 'major_version_upgrade',
            message: `Major version upgrade from ${currentVersion} to ${targetVersion}`,
            confidence: 85,
            severity: 'high'
          });
        }

        // Check for very old versions
        if (this.isVeryOldVersion(currentVersion)) {
          breakingChanges.push({
            type: 'very_old_version',
            message: `Current version ${currentVersion} is very old and may have security issues`,
            confidence: 90,
            severity: 'medium'
          });
        }
      }

    } catch (error) {
      console.error(`Error checking Maven Central: ${error.message}`);
    }

    return { breakingChanges };
  }

  /**
   * Check Libraries.io for dependency information
   * @param {string} groupId - Maven group ID
   * @param {string} artifactId - Maven artifact ID
   * @param {string} currentVersion - Current version
   * @param {string} targetVersion - Target version
   * @returns {Object} - Libraries.io analysis
   */
  async checkLibrariesIO(groupId, artifactId, currentVersion, targetVersion) {
    const breakingChanges = [];

    try {
      // Note: Libraries.io requires API key for full access
      // For MVP, we'll use basic checks
      const projectUrl = `${this.librariesIOBaseUrl}/maven/${groupId}/${artifactId}`;
      
      // Check if project exists and get basic info
      const response = await fetch(projectUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        // Check for deprecation warnings
        if (data.deprecation_reason) {
          breakingChanges.push({
            type: 'deprecated_dependency',
            message: `Dependency is deprecated: ${data.deprecation_reason}`,
            confidence: 95,
            severity: 'high'
          });
        }

        // Check for maintenance status
        if (data.latest_release_published_at) {
          const lastRelease = new Date(data.latest_release_published_at);
          const now = new Date();
          const monthsSinceLastRelease = (now - lastRelease) / (1000 * 60 * 60 * 24 * 30);
          
          if (monthsSinceLastRelease > 12) {
            breakingChanges.push({
              type: 'inactive_maintenance',
              message: `Dependency has not been updated for ${Math.floor(monthsSinceLastRelease)} months`,
              confidence: 70,
              severity: 'medium'
            });
          }
        }
      }

    } catch (error) {
      console.error(`Error checking Libraries.io: ${error.message}`);
    }

    return { breakingChanges };
  }

  /**
   * Check for security vulnerabilities
   * @param {string} groupId - Maven group ID
   * @param {string} artifactId - Maven artifact ID
   * @param {string} currentVersion - Current version
   * @returns {Object} - Security analysis
   */
  async checkSecurityVulnerabilities(groupId, artifactId, currentVersion) {
    const vulnerabilities = [];

    try {
      // Check NVD for known vulnerabilities
      const searchTerm = `${groupId}:${artifactId}`;
      const response = await fetch(
        `${this.nvdBaseUrl}?keywordSearch=${encodeURIComponent(searchTerm)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.vulnerabilities) {
          for (const vuln of data.vulnerabilities) {
            const cve = vuln.cve;
            
            // Check if vulnerability affects current version
            if (this.isVersionAffected(currentVersion, cve.configurations)) {
              vulnerabilities.push({
                cveId: cve.id,
                description: cve.descriptions?.[0]?.value || 'No description available',
                severity: cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity || 'UNKNOWN',
                confidence: 90,
                affectedVersion: currentVersion
              });
            }
          }
        }
      }

    } catch (error) {
      console.error(`Error checking security vulnerabilities: ${error.message}`);
    }

    return { vulnerabilities };
  }

  /**
   * Check changelog for API changes
   * @param {string} groupId - Maven group ID
   * @param {string} artifactId - Maven artifact ID
   * @param {string} currentVersion - Current version
   * @param {string} targetVersion - Target version
   * @returns {Object} - Changelog analysis
   */
  async checkChangelog(groupId, artifactId, currentVersion, targetVersion) {
    const apiChanges = [];

    try {
      // Common changelog patterns for breaking changes
      const breakingChangeKeywords = [
        'breaking change',
        'incompatible',
        'removed',
        'deprecated',
        'changed api',
        'major version'
      ];

      // For MVP, we'll use pattern-based detection
      // In full implementation, this would fetch actual changelogs
      const currentMajor = this.getMajorVersion(currentVersion);
      const targetMajor = this.getMajorVersion(targetVersion);
      
      if (targetMajor > currentMajor) {
        apiChanges.push({
          type: 'major_version_api_change',
          message: `Major version upgrade likely includes API changes`,
          confidence: 80,
          severity: 'high'
        });
      }

    } catch (error) {
      console.error(`Error checking changelog: ${error.message}`);
    }

    return { apiChanges };
  }

  /**
   * Calculate confidence score based on findings
   * @param {Object} results - Analysis results
   * @returns {number} - Confidence score (0-100)
   */
  calculateConfidence(results) {
    let confidence = 0;
    
    // High confidence indicators
    if (results.breakingChanges.some(bc => bc.confidence >= 90)) {
      confidence += 40;
    }
    
    if (results.securityVulnerabilities.length > 0) {
      confidence += 30;
    }
    
    if (results.apiChanges.some(ac => ac.confidence >= 80)) {
      confidence += 25;
    }
    
    // Medium confidence indicators
    if (results.breakingChanges.some(bc => bc.confidence >= 70)) {
      confidence += 15;
    }
    
    return Math.min(100, confidence);
  }

  /**
   * Generate recommendations based on findings
   * @param {Object} results - Analysis results
   * @returns {Array} - Recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];

    if (results.securityVulnerabilities.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Update immediately due to security vulnerabilities',
        details: `Found ${results.securityVulnerabilities.length} security issues`
      });
    }

    if (results.breakingChanges.some(bc => bc.type === 'major_version_upgrade')) {
      recommendations.push({
        priority: 'high',
        action: 'Review breaking changes before upgrading',
        details: 'Major version upgrade detected - check migration guide'
      });
    }

    if (results.breakingChanges.some(bc => bc.type === 'deprecated_dependency')) {
      recommendations.push({
        priority: 'medium',
        action: 'Consider alternative dependencies',
        details: 'Current dependency is deprecated'
      });
    }

    return recommendations;
  }

  /**
   * Compare two version strings
   * @param {string} version1 - First version
   * @param {string} version2 - Second version
   * @returns {number} - Comparison result
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;
      
      if (v1 < v2) return -1;
      if (v1 > v2) return 1;
    }
    
    return 0;
  }

  /**
   * Get major version number
   * @param {string} version - Version string
   * @returns {number} - Major version
   */
  getMajorVersion(version) {
    const parts = version.split('.');
    return parseInt(parts[0]) || 0;
  }

  /**
   * Check if version is very old
   * @param {string} version - Version string
   * @returns {boolean} - True if very old
   */
  isVeryOldVersion(version) {
    const major = this.getMajorVersion(version);
    return major < 2; // Arbitrary threshold for MVP
  }

  /**
   * Check if version is affected by vulnerability
   * @param {string} version - Version to check
   * @param {Array} configurations - CVE configurations
   * @returns {boolean} - True if affected
   */
  isVersionAffected(version, configurations) {
    // Simplified version check for MVP
    // In full implementation, this would parse version ranges
    return true; // Assume affected for MVP
  }

  /**
   * Batch check multiple dependencies
   * @param {Array} dependencies - Array of dependency objects
   * @returns {Array} - Array of breaking change results
   */
  async batchCheckDependencies(dependencies) {
    const results = [];
    
    for (const dep of dependencies) {
      const result = await this.detectBreakingChanges(
        dep.groupId,
        dep.artifactId,
        dep.currentVersion,
        dep.targetVersion
      );
      
      results.push({
        dependency: dep,
        analysis: result
      });
    }
    
    return results;
  }
}
