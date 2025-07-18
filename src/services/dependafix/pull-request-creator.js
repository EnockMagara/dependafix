import { RepositoryManager } from './repository-manager.js';

/**
 * Pull Request Creator - Creates comprehensive pull requests with applied fixes
 * 
 * Design Patterns Used:
 * - Builder Pattern: Builds complex PR descriptions step by step
 * - Template Method Pattern: Common PR creation workflow
 * - Strategy Pattern: Different PR templates for different fix types
 */
export class PullRequestCreator {
  constructor(context) {
    this.context = context;
    this.log = context.log;
    this.octokit = context.octokit;
    this.repositoryManager = new RepositoryManager(context);
  }

  /**
   * Create pull request with applied fixes
   * @param {Object} repository - Repository information
   * @param {Array} appliedFixes - Array of applied fixes
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Created pull request
   */
  async createFixPullRequest(repository, appliedFixes, metadata = {}) {
    const prId = `pr-${Date.now()}`;
    
    try {
      this.log.info(`🔀 Creating fix pull request [${prId}]`);
      
      // Generate branch name
      const branchName = this.generateBranchName(metadata);
      
      // Create PR title and body
      const prTitle = this.generatePRTitle(appliedFixes, metadata);
      const prBody = this.generatePRBody(appliedFixes, metadata);
      
      // Create the pull request
      const pullRequest = await this.octokit.rest.pulls.create({
        owner: repository.owner.login,
        repo: repository.name,
        title: prTitle,
        head: branchName,
        base: repository.default_branch,
        body: prBody
      });
      
      this.log.info(`✅ Created pull request #${pullRequest.data.number}: ${pullRequest.data.html_url}`);
      
      // Add labels
      await this.addLabels(repository, pullRequest.data.number, appliedFixes, metadata);
      
      // Add reviewers if configured
      await this.addReviewers(repository, pullRequest.data.number, metadata);
      
      return {
        ...pullRequest.data,
        issuesFixed: appliedFixes.length,
        appliedFixes: appliedFixes.length,
        processingId: metadata.processingId
      };
      
    } catch (error) {
      this.log.error(`❌ Failed to create fix pull request [${prId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate branch name for the fix
   * @param {Object} metadata - Metadata
   * @returns {string} - Branch name
   */
  generateBranchName(metadata) {
    const timestamp = Date.now();
    const processingId = metadata.processingId || 'unknown';
    const buildTool = metadata.buildTool || 'java';
    
    return `dependafix/${buildTool}-fixes-${timestamp}`;
  }

  /**
   * Generate pull request title
   * @param {Array} appliedFixes - Applied fixes
   * @param {Object} metadata - Metadata
   * @returns {string} - PR title
   */
  generatePRTitle(appliedFixes, metadata) {
    const buildTool = metadata.buildTool || 'Java';
    const fixCount = appliedFixes.length;
    
    if (fixCount === 1) {
      const fix = appliedFixes[0];
      return `🔧 Fix ${buildTool} dependency issue: ${fix.description || fix.type}`;
    } else {
      return `🔧 Fix ${fixCount} ${buildTool} dependency issues`;
    }
  }

  /**
   * Generate comprehensive pull request body
   * @param {Array} appliedFixes - Applied fixes
   * @param {Object} metadata - Metadata
   * @returns {string} - PR body
   */
  generatePRBody(appliedFixes, metadata) {
    const builder = new PRBodyBuilder(appliedFixes, metadata);
    
    return builder
      .addHeader()
      .addSummary()
      .addFixDetails()
      .addTechnicalDetails()
      .addTestingInstructions()
      .addNextSteps()
      .addFooter()
      .build();
  }

  /**
   * Add appropriate labels to the pull request
   * @param {Object} repository - Repository information
   * @param {number} prNumber - PR number
   * @param {Array} appliedFixes - Applied fixes
   * @param {Object} metadata - Metadata
   */
  async addLabels(repository, prNumber, appliedFixes, metadata) {
    try {
      const labels = ['dependafix', 'automated-fix', 'dependency'];
      
      // Add build tool label
      if (metadata.buildTool) {
        labels.push(metadata.buildTool.toLowerCase());
      }
      
      // Add fix type labels
      const fixTypes = [...new Set(appliedFixes.map(fix => fix.type))];
      labels.push(...fixTypes.map(type => `fix-${type.replace('_', '-')}`));
      
      // Add severity labels
      const severities = appliedFixes.map(fix => fix.severity || 'medium');
      const highestSeverity = this.getHighestSeverity(severities);
      labels.push(`severity-${highestSeverity}`);
      
      await this.octokit.rest.issues.addLabels({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: prNumber,
        labels: labels
      });
      
      this.log.info(`✅ Added ${labels.length} labels to PR #${prNumber}`);
    } catch (error) {
      this.log.warn(`⚠️ Failed to add labels to PR #${prNumber}: ${error.message}`);
    }
  }

  /**
   * Add reviewers to the pull request
   * @param {Object} repository - Repository information
   * @param {number} prNumber - PR number
   * @param {Object} metadata - Metadata
   */
  async addReviewers(repository, prNumber, metadata) {
    try {
      // This would be configured based on repository settings
      const reviewers = metadata.reviewers || [];
      
      if (reviewers.length > 0) {
        await this.octokit.rest.pulls.requestReviewers({
          owner: repository.owner.login,
          repo: repository.name,
          pull_number: prNumber,
          reviewers: reviewers
        });
        
        this.log.info(`✅ Added ${reviewers.length} reviewers to PR #${prNumber}`);
      }
    } catch (error) {
      this.log.warn(`⚠️ Failed to add reviewers to PR #${prNumber}: ${error.message}`);
    }
  }

  /**
   * Get highest severity from array of severities
   * @param {Array} severities - Array of severity strings
   * @returns {string} - Highest severity
   */
  getHighestSeverity(severities) {
    const severityOrder = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    
    return severities.reduce((highest, current) => {
      const currentLevel = severityOrder[current] || 2;
      const highestLevel = severityOrder[highest] || 2;
      return currentLevel > highestLevel ? current : highest;
    }, 'medium');
  }

  /**
   * Create pull request for dependency updates
   * @param {Object} repository - Repository information
   * @param {Object} dependencyResult - Dependency check result
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Created pull request
   */
  async createDependencyUpdatePR(repository, dependencyResult, metadata = {}) {
    const prId = `dep-update-${Date.now()}`;
    
    try {
      this.log.info(`🔀 Creating dependency update pull request [${prId}]`);
      
      // Generate branch name
      const branchName = this.generateDependencyUpdateBranchName(metadata);
      
      // Create PR title and body
      const prTitle = this.generateDependencyUpdatePRTitle(dependencyResult, metadata);
      const prBody = this.generateDependencyUpdatePRBody(dependencyResult, metadata);
      
      // Create the pull request
      const pullRequest = await this.octokit.rest.pulls.create({
        owner: repository.owner.login,
        repo: repository.name,
        title: prTitle,
        head: branchName,
        base: repository.default_branch,
        body: prBody
      });
      
      this.log.info(`✅ Created dependency update PR #${pullRequest.data.number}: ${pullRequest.data.html_url}`);
      
      // Add labels
      await this.addDependencyUpdateLabels(repository, pullRequest.data.number, dependencyResult, metadata);
      
      return {
        ...pullRequest.data,
        outdatedDependencies: dependencyResult.outdatedDependencies.length
      };
      
    } catch (error) {
      this.log.error(`❌ Failed to create dependency update PR [${prId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate branch name for dependency updates
   * @param {Object} metadata - Metadata
   * @returns {string} - Branch name
   */
  generateDependencyUpdateBranchName(metadata) {
    const timestamp = Date.now();
    const buildTool = metadata.buildTool || 'java';
    
    return `dependafix/${buildTool}-dependency-updates-${timestamp}`;
  }

  /**
   * Generate dependency update PR title
   * @param {Object} dependencyResult - Dependency check result
   * @param {Object} metadata - Metadata
   * @returns {string} - PR title
   */
  generateDependencyUpdatePRTitle(dependencyResult, metadata) {
    const buildTool = metadata.buildTool || 'Java';
    const outdatedCount = dependencyResult.outdatedDependencies.length;
    
    if (outdatedCount > 0) {
      return `📦 Update ${buildTool} dependencies (${outdatedCount} outdated)`;
    } else {
      return `✅ ${buildTool} dependencies are up to date`;
    }
  }

  /**
   * Generate dependency update PR body
   * @param {Object} dependencyResult - Dependency check result
   * @param {Object} metadata - Metadata
   * @returns {string} - PR body
   */
  generateDependencyUpdatePRBody(dependencyResult, metadata) {
    const builder = new DependencyUpdatePRBodyBuilder(dependencyResult, metadata);
    
    return builder
      .addHeader()
      .addSummary()
      .addOutdatedDependencies()
      .addRecommendations()
      .addUpdateCommands()
      .addTestingInstructions()
      .addNextSteps()
      .addFooter()
      .build();
  }

  /**
   * Add labels for dependency update PR
   * @param {Object} repository - Repository information
   * @param {number} prNumber - PR number
   * @param {Object} dependencyResult - Dependency check result
   * @param {Object} metadata - Metadata
   */
  async addDependencyUpdateLabels(repository, prNumber, dependencyResult, metadata) {
    try {
      const labels = ['dependafix', 'dependency-update', 'automated'];
      
      // Add build tool label
      if (metadata.buildTool) {
        labels.push(metadata.buildTool.toLowerCase());
      }
      
      // Add severity labels based on findings
      if (dependencyResult.outdatedDependencies.length > 0) {
        labels.push('maintenance');
      }
      
      await this.octokit.rest.issues.addLabels({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: prNumber,
        labels: labels
      });
      
      this.log.info(`✅ Added ${labels.length} labels to dependency update PR #${prNumber}`);
    } catch (error) {
      this.log.warn(`⚠️ Failed to add labels to dependency update PR #${prNumber}: ${error.message}`);
    }
  }
}

/**
 * PR Body Builder - Builds comprehensive PR descriptions
 */
class PRBodyBuilder {
  constructor(appliedFixes, metadata) {
    this.appliedFixes = appliedFixes;
    this.metadata = metadata;
    this.sections = [];
  }

  /**
   * Add header section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addHeader() {
    const header = `## 🤖 Dependafix: Automated Java Dependency Fixes

This pull request contains automated fixes for Java dependency-related build failures detected by Dependafix.

> **⚠️ Important**: This PR was automatically generated. Please review all changes carefully before merging.`;

    this.sections.push(header);
    return this;
  }

  /**
   * Add summary section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addSummary() {
    const fixCount = this.appliedFixes.length;
    const buildTool = this.metadata.buildTool || 'Unknown';
    const issuesFixed = this.metadata.issues?.length || fixCount;
    
    const summary = `### 📋 Summary

- **Build Tool**: ${buildTool}
- **Issues Detected**: ${issuesFixed}
- **Fixes Applied**: ${fixCount}
- **Processing ID**: \`${this.metadata.processingId || 'unknown'}\`
- **Success Rate**: ${fixCount}/${issuesFixed} (${Math.round((fixCount/issuesFixed) * 100)}%)`;

    this.sections.push(summary);
    return this;
  }

  /**
   * Add fix details section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addFixDetails() {
    let details = `### 🔧 Applied Fixes\n\n`;
    
    this.appliedFixes.forEach((fix, index) => {
      details += `#### ${index + 1}. ${fix.description || fix.type}\n\n`;
      details += `- **Type**: ${fix.type}\n`;
      details += `- **Confidence**: ${Math.round((fix.confidence || 0.8) * 100)}%\n`;
      
      if (fix.filePath) {
        details += `- **File**: \`${fix.filePath}\`\n`;
      }
      
      if (fix.appliedFiles && fix.appliedFiles.length > 0) {
        details += `- **Modified Files**: ${fix.appliedFiles.map(f => `\`${f}\``).join(', ')}\n`;
      }
      
      if (fix.issues && fix.issues.length > 0) {
        details += `- **Addresses Issues**: ${fix.issues.join(', ')}\n`;
      }
      
      details += '\n';
      
      // Add code snippet if available
      if (fix.content && fix.content.length < 500) {
        details += `<details>\n<summary>View fix code</summary>\n\n\`\`\`${fix.language || 'java'}\n${fix.content}\n\`\`\`\n</details>\n\n`;
      }
      
      details += '---\n\n';
    });
    
    this.sections.push(details);
    return this;
  }

  /**
   * Add technical details section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addTechnicalDetails() {
    const details = `### 🔍 Technical Details

#### How Dependafix Works
1. **Detection**: Monitors dependency changes in pull requests and pushes
2. **Analysis**: Runs build and analyzes failure logs using AI
3. **Fix Generation**: Uses Large Language Models to generate targeted fixes
4. **Validation**: Applies fixes and validates by rebuilding the project
5. **PR Creation**: Creates this pull request with validated fixes

#### Fix Types Applied
${this.appliedFixes.map(fix => `- **${fix.type}**: ${this.getFixTypeDescription(fix.type)}`).join('\n')}

#### Build Tool: ${this.metadata.buildTool || 'Unknown'}
${this.getBuildToolSpecificInfo()}`;

    this.sections.push(details);
    return this;
  }

  /**
   * Add testing instructions section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addTestingInstructions() {
    const buildTool = this.metadata.buildTool || 'maven';
    const buildCommand = buildTool === 'maven' ? 'mvn clean compile' : './gradlew build';
    const testCommand = buildTool === 'maven' ? 'mvn test' : './gradlew test';
    
    const instructions = `### 🧪 Testing Instructions

To verify these fixes work correctly:

1. **Checkout this branch**:
   \`\`\`bash
   git checkout ${this.getBranchName()}
   \`\`\`

2. **Run the build**:
   \`\`\`bash
   ${buildCommand}
   \`\`\`

3. **Run tests**:
   \`\`\`bash
   ${testCommand}
   \`\`\`

4. **Verify functionality**:
   - Test the specific features affected by the dependency changes
   - Run integration tests if available
   - Check for any runtime issues

#### Expected Results
- ✅ Build should complete successfully
- ✅ All existing tests should pass
- ✅ No new compilation errors
- ✅ Application should start and run normally`;

    this.sections.push(instructions);
    return this;
  }

  /**
   * Add next steps section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addNextSteps() {
    const steps = `### 🚀 Next Steps

1. **Review Changes**: Carefully review all modified files
2. **Test Thoroughly**: Run the testing instructions above
3. **Verify Functionality**: Ensure your application works as expected
4. **Merge**: If everything looks good, merge this PR
5. **Monitor**: Watch for any issues after deployment

#### If Issues Occur
- Check the build logs for any new errors
- Review the specific changes made by each fix
- Consider reverting individual fixes if needed
- Report issues to the Dependafix team for improvement`;

    this.sections.push(steps);
    return this;
  }

  /**
   * Add footer section
   * @returns {PRBodyBuilder} - Builder instance
   */
  addFooter() {
    const footer = `---

### 📊 Metrics
- **Processing Time**: ${this.getProcessingTime()}
- **Fixes Generated**: ${this.appliedFixes.length}
- **Success Rate**: ${this.getSuccessRate()}
- **Build Tool**: ${this.metadata.buildTool || 'Unknown'}

### 🔗 Links
- [Dependafix Documentation](https://github.com/your-org/dependafix)
- [Report Issues](https://github.com/your-org/dependafix/issues)
- [Processing ID: \`${this.metadata.processingId || 'unknown'}\`]

---

*This pull request was automatically created by **Dependafix** 🤖*  
*Powered by AI and validated through automated testing*`;

    this.sections.push(footer);
    return this;
  }

  /**
   * Build the complete PR body
   * @returns {string} - Complete PR body
   */
  build() {
    return this.sections.join('\n\n');
  }

  /**
   * Get fix type description
   * @param {string} type - Fix type
   * @returns {string} - Description
   */
  getFixTypeDescription(type) {
    const descriptions = {
      'code_fix': 'Direct code modifications to fix compilation errors',
      'dependency_update': 'Updates to dependency versions in build files',
      'import_fix': 'Fixes to import statements and package references',
      'file_modification': 'General file modifications to resolve issues',
      'api_compatibility': 'Changes to maintain API compatibility'
    };
    
    return descriptions[type] || 'Automated fix for detected issue';
  }

  /**
   * Get build tool specific information
   * @returns {string} - Build tool info
   */
  getBuildToolSpecificInfo() {
    const buildTool = this.metadata.buildTool;
    
    if (buildTool === 'maven') {
      return `- Configuration file: \`pom.xml\`
- Build command: \`mvn clean compile\`
- Test command: \`mvn test\``;
    } else if (buildTool === 'gradle') {
      return `- Configuration files: \`build.gradle\`, \`build.gradle.kts\`
- Build command: \`./gradlew build\`
- Test command: \`./gradlew test\``;
    } else {
      return '- Build tool details not available';
    }
  }

  /**
   * Get branch name
   * @returns {string} - Branch name
   */
  getBranchName() {
    return `dependafix/${this.metadata.buildTool || 'java'}-fixes-${Date.now()}`;
  }

  /**
   * Get processing time
   * @returns {string} - Processing time
   */
  getProcessingTime() {
    const processingTime = this.metadata.processingTime || 0;
    return processingTime > 0 ? `${Math.round(processingTime / 1000)}s` : 'Unknown';
  }

  /**
   * Get success rate
   * @returns {string} - Success rate
   */
  getSuccessRate() {
    const total = this.metadata.issues?.length || this.appliedFixes.length;
    const successful = this.appliedFixes.length;
    return `${Math.round((successful / total) * 100)}%`;
  }
}

/**
 * Dependency Update PR Body Builder
 * 
 * Builds comprehensive pull request bodies for dependency updates
 */
class DependencyUpdatePRBodyBuilder {
  constructor(dependencyResult, metadata) {
    this.dependencyResult = dependencyResult;
    this.metadata = metadata;
    this.sections = [];
  }

  /**
   * Add header section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addHeader() {
    const header = `## 📦 Java Dependency Updates

This pull request contains updates to outdated Java dependencies detected by Dependafix.

### 🔍 What This PR Does
- **Scans** your project for outdated dependencies
- **Identifies** security vulnerabilities
- **Provides** update recommendations
- **Creates** this pull request with detailed information`;

    this.sections.push(header);
    return this;
  }

  /**
   * Add summary section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addSummary() {
    const summary = `### 📊 Summary

| Metric | Count |
|--------|-------|
| **Total Dependencies** | ${this.dependencyResult.report?.summary?.totalDependencies || 0} |
| **Outdated Dependencies** | ${this.dependencyResult.outdatedDependencies.length} |
| **Build Tool** | ${this.metadata.buildTool || 'Unknown'} |
| **Scan Date** | ${new Date().toLocaleDateString()}`;

    this.sections.push(summary);
    return this;
  }

  /**
   * Add outdated dependencies section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addOutdatedDependencies() {
    if (this.dependencyResult.outdatedDependencies.length === 0) {
      const section = `### ✅ Outdated Dependencies

🎉 **Great news!** All your dependencies are up to date. No updates are needed at this time.`;
      this.sections.push(section);
      return this;
    }

    let section = `### 📋 Outdated Dependencies

The following dependencies have newer versions available:

| Group ID | Artifact ID | Current Version | Latest Version | Scope |
|----------|-------------|-----------------|----------------|-------|`;

    this.dependencyResult.outdatedDependencies.forEach(dep => {
      section += `\n| ${dep.groupId} | ${dep.artifactId} | \`${dep.currentVersion}\` | \`${dep.latestVersion}\` | ${dep.scope} |`;
    });

    section += `\n\n**Total outdated dependencies**: ${this.dependencyResult.outdatedDependencies.length}`;

    this.sections.push(section);
    return this;
  }



  /**
   * Add recommendations section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addRecommendations() {
    const recommendations = this.dependencyResult.report?.recommendations || [];
    
    if (recommendations.length === 0) {
      return this;
    }

    let section = `### 💡 Recommendations

Based on the dependency analysis, here are our recommendations:`;

    recommendations.forEach(rec => {
      const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      section += `\n\n${priorityIcon} **${rec.description}**\n- **Priority**: ${rec.priority}\n- **Action**: ${rec.action}`;
    });

    this.sections.push(section);
    return this;
  }

  /**
   * Add update commands section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addUpdateCommands() {
    const buildTool = this.metadata.buildTool || 'maven';
    const commands = this.getUpdateCommands(buildTool);
    
    const section = `### 🛠️ Manual Update Commands

If you prefer to update dependencies manually, you can use these commands:

#### For ${buildTool.toUpperCase()}

**Check for outdated dependencies:**
\`\`\`bash
${commands.check || 'Command not available'}
\`\`\`

**Update to latest versions:**
\`\`\`bash
${commands.update || 'Command not available'}
\`\`\`

**Update to latest releases only:**
\`\`\`bash
${commands.updateReleases || 'Command not available'}
\`\`\`

> ⚠️ **Important**: Always test thoroughly after updating dependencies!`;

    this.sections.push(section);
    return this;
  }

  /**
   * Add testing instructions section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addTestingInstructions() {
    const buildTool = this.metadata.buildTool || 'maven';
    const buildCommand = buildTool === 'maven' ? 'mvn clean compile' : './gradlew build';
    const testCommand = buildTool === 'maven' ? 'mvn test' : './gradlew test';
    
    const instructions = `### 🧪 Testing Instructions

After updating dependencies, please test thoroughly:

1. **Clean and build**:
   \`\`\`bash
   ${buildCommand}
   \`\`\`

2. **Run tests**:
   \`\`\`bash
   ${testCommand}
   \`\`\`

3. **Integration tests** (if available):
   \`\`\`bash
   ${buildTool === 'maven' ? 'mvn verify' : './gradlew integrationTest'}
   \`\`\`

4. **Manual testing**:
   - Test all major functionality
   - Check for any runtime issues
   - Verify API compatibility

#### Expected Results
- ✅ Build completes successfully
- ✅ All tests pass
- ✅ No compilation errors
- ✅ Application runs normally`;

    this.sections.push(instructions);
    return this;
  }

  /**
   * Add next steps section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addNextSteps() {
    const steps = `### 🚀 Next Steps

1. **Review the findings** above
2. **Update dependencies** using the provided commands
3. **Test thoroughly** following the testing instructions
4. **Monitor** for any issues after deployment

#### Priority Actions
${this.dependencyResult.outdatedDependencies.length > 0 ? '- 🟡 **MEDIUM**: Update outdated dependencies when convenient' : '- ✅ All dependencies are up to date'}`;

    this.sections.push(steps);
    return this;
  }

  /**
   * Add footer section
   * @returns {DependencyUpdatePRBodyBuilder} - Builder instance
   */
  addFooter() {
    const footer = `---

### 📊 Scan Information
- **Build Tool**: ${this.metadata.buildTool || 'Unknown'}
- **Scan Date**: ${new Date().toISOString()}
- **Total Dependencies**: ${this.dependencyResult.report?.summary?.totalDependencies || 0}
- **Processing ID**: \`${this.metadata.processingId || 'unknown'}\`

### 🔗 Resources
- [Dependafix Documentation](https://github.com/your-org/dependafix)
- [Maven Versions Plugin](https://www.mojohaus.org/versions-maven-plugin/)
- [Gradle Versions Plugin](https://github.com/ben-manes/gradle-versions-plugin)
- [OWASP Dependency Check](https://owasp.org/www-project-dependency-check/)

---

*This dependency analysis was performed by **Dependafix** 🤖*  
*Automated dependency monitoring and security scanning*`;

    this.sections.push(footer);
    return this;
  }

  /**
   * Build the complete PR body
   * @returns {string} - Complete PR body
   */
  build() {
    return this.sections.join('\n\n');
  }

  /**
   * Get update commands for the build tool
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