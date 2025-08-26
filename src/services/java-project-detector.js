/**
 * Service for detecting Java projects (Maven/Gradle)
 */
export class JavaProjectDetector {
  constructor(context) {
    this.context = context;
    this.octokit = context.octokit;
    this.log = context.log;
  }

  /**
   * Check if this is a Java project by looking for build files
   * @returns {boolean} - True if Java project detected
   */
  async isJavaProject() {
    const { repository } = this.context.payload;
    
    try {
      // Check for Maven pom.xml
      const hasPomXml = await this.fileExists('pom.xml');
      if (hasPomXml) {
        this.log.info(`✅ Maven project detected: ${repository.full_name}`);
        return true;
      }
      
      // Check for Gradle build files
      const hasGradleBuild = await this.fileExists('build.gradle');
      const hasGradleKts = await this.fileExists('build.gradle.kts');
      
      if (hasGradleBuild || hasGradleKts) {
        this.log.info(`✅ Gradle project detected: ${repository.full_name}`);
        return true;
      }
      
      this.log.info(`❌ No Java build files found: ${repository.full_name}`);
      return false;
      
    } catch (error) {
      this.log.error(`Error detecting Java project: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a file exists in the repository
   * @param {string} filePath - Path to the file
   * @returns {boolean} - True if file exists
   */
  async fileExists(filePath) {
    try {
      const { repository } = this.context.payload;
      
      await this.octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: filePath,
      });
      
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get the build tool type (maven or gradle)
   * @returns {string|null} - Build tool type or null if not Java project
   */
  async getBuildTool() {
    if (await this.fileExists('pom.xml')) {
      return 'maven';
    }
    
    if (await this.fileExists('build.gradle') || await this.fileExists('build.gradle.kts')) {
      return 'gradle';
    }
    
    return null;
  }
}
