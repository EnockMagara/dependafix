# Java Breaking Change Detector

A GitHub bot that automatically detects breaking changes in Java dependency updates and creates new branches with fixes, featuring comprehensive build validation and CI/CD integration.

## 🎯 Overview

Java Breaking Change Detector is a Probot-based GitHub application that:

- **Detects breaking changes** in Java dependency updates by analyzing build logs
- **Validates builds comprehensively** using Maven or Gradle
- **Creates new branches** automatically when breaking changes are found
- **Applies basic fixes** and adds documentation for the issues
- **Supports Maven and Gradle** projects with build tool detection
- **Integrates seamlessly** with GitHub workflows
- **Provides CI/CD integration** with GitHub Actions, Jenkins, and GitLab CI

## 🚀 Features

### Core Functionality
- **Automatic Detection**: Monitors push events for Java dependency updates
- **Build Validation**: Comprehensive build analysis (clean, compile, test, dependencies)
- **Branch Creation**: Creates new branches with fixes when breaking changes are detected
- **Issue Tracking**: Creates GitHub issues to track breaking changes
- **Manual Triggers**: Supports manual breaking change checks via comments

### CI/CD Integration
- **GitHub Actions**: Automatic workflow creation and integration
- **Jenkins Support**: Jenkins pipeline integration (placeholder)
- **GitLab CI**: GitLab CI/CD integration (placeholder)
- **Workflow Monitoring**: Monitors CI/CD workflows for breaking changes
- **Automatic Notifications**: Creates issues and notifications for CI/CD failures
- **Platform Detection**: Automatically detects and configures CI/CD platforms

### Supported Java Build Tools
- **Maven**: Analyzes `pom.xml` changes and Maven build logs
- **Gradle**: Analyzes `build.gradle` changes and Gradle build logs

### Breaking Change Detection
- **Removed Classes/Packages**: Detects when classes or packages are no longer available
- **API Signature Changes**: Identifies method signature incompatibilities
- **Deprecated APIs**: Finds usage of deprecated methods and classes
- **Dependency Conflicts**: Detects version conflicts and incompatible dependencies
- **Type Incompatibilities**: Identifies type-related breaking changes
- **Build Failures**: Analyzes compilation and test failures

### Build Validation Process
1. **Clean Build**: Removes previous build artifacts
2. **Compile**: Compiles source code and detects compilation errors
3. **Test**: Runs unit tests and detects test failures
4. **Dependency Analysis**: Checks for dependency conflicts
5. **Failure Analysis**: Categorizes and prioritizes build failures

## 🏗️ Architecture

The project uses several design patterns for maintainability and extensibility:

### Design Patterns
- **Strategy Pattern**: Different detection strategies for Maven vs Gradle
- **Factory Pattern**: Creates appropriate build validators and detectors
- **Observer Pattern**: Webhook event handling and monitoring
- **Template Method Pattern**: Common build validation workflow with tool-specific implementations
- **Command Pattern**: Encapsulates build operations as commands

### Core Services
- **BreakingChangeDetector**: Main service for detecting Java breaking changes
- **JavaBuildValidator**: Comprehensive build validation service
- **BranchCreator**: Handles repository cloning and branch creation
- **CICDIntegration**: CI/CD platform integration and workflow management
- **Detection Strategies**: Maven and Gradle specific implementations

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm 8+
- Git
- Java 11+ (for Java projects)
- Maven 3.6+ (for Maven projects)
- Gradle 7+ (for Gradle projects)

### Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/java-breaking-change-detector.git
   cd java-breaking-change-detector
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp env.example .env
   # Edit .env with your GitHub App configuration
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Start the application**:
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables
```bash
# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY=your_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Application Settings
NODE_ENV=production
LOG_LEVEL=info
BUILD_TIMEOUT=300000
BRANCH_PREFIX=fix/breaking-changes
BUILD_VALIDATION_ENABLED=true

# CI/CD Integration Settings
GITHUB_ACTIONS_ENABLED=true
WORKFLOW_TRIGGERS=push,pull_request
AUTO_CREATE_WORKFLOWS=true
```

### GitHub App Setup
1. Create a new GitHub App in your organization
2. Configure webhook events: `push`, `pull_request`, `issue_comment`, `workflow_run`
3. Set repository permissions for contents and pull requests
4. Install the app on Java repositories you want to monitor

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Test Breaking Changes
```bash
npm run test:breaking-changes
```

### Test Specific Features
```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# Watch mode
npm run test:watch
```

### Manual Testing
```bash
# Start mock server
npm run mock:server

# Simulate webhook events
npm run test:mock-webhook
```

## 📋 Usage

### Automatic Detection
The bot automatically monitors:
- **Push Events**: When Java dependency files are modified (primary focus)
- **Pull Requests**: When opened or updated with dependency changes
- **Manual Triggers**: When `/check-breaking-changes` is commented on issues
- **CI/CD Workflows**: When workflow runs fail due to breaking changes

### Manual Commands
Add a comment to any issue:
```
/check-breaking-changes
```

Setup CI/CD integration:
```
/setup-cicd
```

### Expected Workflow
1. **Java Dependency Update**: Someone updates dependencies in a push or PR
2. **Build Validation**: Bot runs comprehensive build analysis
3. **Breaking Change Detection**: Bot detects breaking changes in build logs
4. **Branch Creation**: Bot creates a new branch with fixes
5. **CI/CD Integration**: Bot sets up CI/CD workflows for future monitoring
6. **Notification**: Bot comments on PR or creates issue with details
7. **Review**: Team reviews the fix branch and creates PR if needed

## 🔍 Java Breaking Change Detection

### Detection Patterns
The bot looks for these patterns in Java build logs:

```java
// Compilation errors
cannot find symbol
package does not exist
incompatible types
method cannot be applied
ClassNotFoundException
NoClassDefFoundError

// Maven patterns
[ERROR] cannot find symbol
[ERROR] package does not exist
[ERROR] method cannot be applied

// Gradle patterns
FAILED
Test.*failed
AssertionError
```

### Build Validation Steps
1. **Clean**: `mvn clean` or `./gradlew clean`
2. **Compile**: `mvn compile` or `./gradlew compileJava`
3. **Test**: `mvn test` or `./gradlew test`
4. **Dependencies**: `mvn dependency:tree` or `./gradlew dependencies`

### Fix Application
When breaking changes are detected, the bot:
1. **Clones the repository** to a temporary directory
2. **Creates a new branch** with a descriptive name
3. **Applies basic fixes**:
   - Adds TODO comments explaining the issues
   - Creates resolution documentation
   - Updates affected files
4. **Commits and pushes** the changes
5. **Cleans up** temporary files

## 🔗 CI/CD Integration

### Supported Platforms
- **GitHub Actions**: Full integration with workflow creation and monitoring
- **Jenkins**: Basic integration (placeholder for future implementation)
- **GitLab CI**: Basic integration (placeholder for future implementation)

### GitHub Actions Integration
The bot automatically creates the following workflows:

#### Breaking Change Detection Workflow
```yaml
name: Java Breaking Change Detection

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'pom.xml'
      - 'build.gradle'
      - 'build.gradle.kts'
      - 'gradle.properties'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'pom.xml'
      - 'build.gradle'
      - 'build.gradle.kts'
      - 'gradle.properties'

jobs:
  detect-breaking-changes:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    - name: Set up Java
      uses: actions/setup-java@v4
      with:
        distribution: 'temurin'
        java-version: '11'
    - name: Run build validation
      run: |
        if [ -f "pom.xml" ]; then
          mvn clean compile test
          mvn dependency:tree
        elif [ -f "build.gradle" ]; then
          ./gradlew clean build
          ./gradlew dependencies
        fi
```

#### Notification Workflow
```yaml
name: Breaking Change Notifications

on:
  workflow_run:
    workflows: ["Java Breaking Change Detection"]
    types: [completed]

jobs:
  notify-breaking-changes:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
    - name: Create issue for breaking changes
      uses: actions/github-script@v7
      with:
        script: |
          await github.rest.issues.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            title: '🚨 Breaking Changes Detected in CI/CD',
            body: 'Breaking changes detected in Java dependencies...',
            labels: ['breaking-changes', 'ci-cd-failure', 'java']
          });
```

### CI/CD Features
- **Automatic Workflow Creation**: Creates GitHub Actions workflows automatically
- **Workflow Monitoring**: Monitors workflow runs for failures
- **Issue Creation**: Creates issues for CI/CD failures with breaking changes
- **Notification System**: Sends notifications via GitHub Issues and Slack (if configured)
- **Platform Detection**: Automatically detects CI/CD platform and configures accordingly

### Workflow Event Handling
The bot monitors `workflow_run` events and:
1. **Analyzes failed workflows** for breaking change patterns
2. **Creates issues** for CI/CD failures with breaking changes
3. **Provides detailed analysis** of the failure
4. **Suggests remediation steps**

## 🏛️ Project Structure

```
src/
├── index.js                    # Main Probot application
├── services/
│   ├── breaking-change-detector.js  # Java detection service
│   ├── branch-creator.js            # Branch creation service
│   └── ci-cd-integration.js         # CI/CD integration service
└── utils/
    └── logger.js                    # Logging utilities
```

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Style
- Use ESLint for code linting
- Follow Prettier formatting
- Write JSDoc comments for public APIs
- Use conventional commit messages

### Testing Guidelines
- Write unit tests for all new services
- Add integration tests for webhook handling
- Test breaking change detection with real Java scenarios
- Test CI/CD integration with mock workflows
- Ensure all tests pass before submitting PRs

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues
- **Build Timeouts**: Increase `BUILD_TIMEOUT` in configuration
- **Permission Errors**: Check GitHub App permissions
- **Detection Failures**: Verify Java and build tools are properly installed
- **Build Tool Detection**: Ensure `pom.xml` or `build.gradle` exists in repository
- **CI/CD Integration**: Check repository permissions for workflow creation

### Getting Help
- Check the [Issues](https://github.com/your-org/java-breaking-change-detector/issues) page
- Review the [Development Guide](DEVELOPMENT.md)
- Contact the maintainers

## 🔄 Roadmap

### Planned Features
- **Enhanced Fix Generation**: More sophisticated Java code fixes
- **Custom Rules**: User-defined breaking change detection rules
- **Metrics Dashboard**: Track breaking change trends
- **Slack Integration**: Notifications via Slack
- **Jenkins Integration**: Full Jenkins pipeline integration
- **GitLab CI Integration**: Full GitLab CI/CD integration

### Future Enhancements
- **Machine Learning**: AI-powered breaking change prediction
- **Dependency Graph Analysis**: Advanced dependency conflict resolution
- **Multi-language Support**: Support for Kotlin and other JVM languages
- **Performance Optimization**: Faster detection and processing
- **Advanced CI/CD**: Support for more CI/CD platforms

---

**Java Breaking Change Detector** - Making Java dependency updates safer, one breaking change at a time! ☕🚀 