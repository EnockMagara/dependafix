# Minimal Breaking Change Detector App

## Overview

This is a simplified version of the breaking change detection system that focuses on the core functionality: detecting breaking changes in dependency updates and creating new branches when they occur.

## Project Structure

```
src/
├── index.js                    # Main Probot application
├── services/
│   ├── breaking-change-detector.js  # Core detection service
│   └── branch-creator.js            # Branch creation service
└── utils/
    └── logger.js                    # Logging utilities
```

## Core Components

### 1. Main Application (`src/index.js`)
- **Purpose**: Probot app that handles GitHub webhook events
- **Events Handled**:
  - `pull_request`: Detects breaking changes in PRs
  - `push`: Detects breaking changes in dependency updates
  - `issue_comment`: Manual breaking change checks via `/check-breaking-changes`
- **Features**:
  - Automatic detection and branch creation
  - GitHub comments and issue creation
  - Error handling and logging

### 2. Breaking Change Detector (`src/services/breaking-change-detector.js`)
- **Purpose**: Detects breaking changes in dependency updates
- **Supported Project Types**:
  - Node.js (package.json)
  - Maven (pom.xml)
  - Gradle (build.gradle)
- **Detection Strategies**:
  - Build log analysis
  - Pattern matching for common breaking changes
  - Dependency conflict detection
- **Breaking Change Types**:
  - Removed classes/packages
  - API signature changes
  - Deprecated APIs
  - Dependency conflicts
  - Type incompatibilities

### 3. Branch Creator (`src/services/branch-creator.js`)
- **Purpose**: Creates new branches with fixes for breaking changes
- **Workflow**:
  1. Clone repository to temp directory
  2. Create new branch with descriptive name
  3. Apply fixes based on breaking changes
  4. Commit and push changes
  5. Clean up temporary files
- **Fix Application**:
  - Adds TODO comments to affected files
  - Creates resolution documentation
  - Handles different types of breaking changes

### 4. Logger (`src/utils/logger.js`)
- **Purpose**: Centralized logging for the application
- **Features**: Structured logging with different levels

## Design Patterns Used

1. **Strategy Pattern**: Different detection strategies for different build tools
2. **Factory Pattern**: Creates appropriate detectors based on project type
3. **Observer Pattern**: Webhook event handling
4. **Template Method Pattern**: Common workflows with tool-specific implementations
5. **Command Pattern**: Encapsulates operations as commands

## Key Features

### Automatic Detection
- Monitors pull requests and push events
- Detects dependency file changes
- Analyzes build logs for breaking changes
- Creates branches automatically when issues are found

### Manual Triggers
- Comment `/check-breaking-changes` on any issue
- Returns detailed analysis of breaking changes
- Provides recommendations for fixes

### Multi-Project Support
- **Node.js**: Analyzes package.json and npm build logs
- **Maven**: Analyzes pom.xml and Maven build logs
- **Gradle**: Analyzes build.gradle and Gradle build logs

### Smart Branch Creation
- Generates descriptive branch names
- Applies appropriate fixes based on change type
- Creates comprehensive commit messages
- Handles cleanup automatically

## Usage

### Running the Demo
```bash
node demo.js
```

### Running the Application
```bash
npm start
```

### Configuration
Set up environment variables in `.env`:
```bash
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY=your_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

## Expected Workflow

1. **Dependency Update**: Someone updates dependencies in a PR
2. **Automatic Detection**: Bot detects breaking changes in build logs
3. **Branch Creation**: Bot creates a new branch with fixes
4. **Notification**: Bot comments on PR with details and next steps
5. **Review**: Team reviews the fix branch and creates PR if needed

## Breaking Change Detection

The system looks for these patterns in build logs:

### Node.js Patterns
- `cannot find symbol`
- `package does not exist`
- `method cannot be applied`
- `deprecated API`

### Java Patterns
- `ClassNotFoundException`
- `NoClassDefFoundError`
- `incompatible types`
- `method.*not found`

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

## Benefits of This Minimal Approach

1. **Focused Functionality**: Only essential breaking change detection
2. **Easy to Understand**: Clear, modular code structure
3. **Extensible**: Easy to add new project types or detection strategies
4. **Maintainable**: Well-documented with design patterns
5. **Testable**: Each component can be tested independently

## Future Enhancements

This minimal app provides a solid foundation for:
- Enhanced fix generation
- More sophisticated detection algorithms
- Additional project type support
- CI/CD integration
- Custom rule configuration

## Conclusion

This minimal breaking change detector provides a focused, maintainable solution for automatically detecting and addressing breaking changes in dependency updates. It uses proven design patterns and provides a clear workflow for teams to handle dependency-related issues efficiently. 