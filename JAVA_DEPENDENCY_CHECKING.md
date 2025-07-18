# Java Dependency Checking Guide

This guide explains how to check for outdated Java dependencies using the Dependafix system.

## Overview

The Java dependency checking system supports:
- **Maven** projects (using `pom.xml`)
- **Gradle** projects (using `build.gradle` or `build.gradle.kts`)
- **Automated pull request creation** for dependency updates
- **Manual and scheduled checks**

## How It Works

### 1. Build Tool Detection
The system automatically detects your build tool by looking for:
- `pom.xml` → Maven project
- `build.gradle` or `build.gradle.kts` → Gradle project
- `gradlew` or `gradlew.bat` → Gradle wrapper

### 2. Dependency Analysis
For each build tool, the system uses different strategies:

#### Maven
- Uses **Maven Versions Plugin** to check for outdated dependencies
- Command: `mvn versions:display-dependency-updates`
- Fallback: Direct parsing of `pom.xml`

#### Gradle
- Uses **Gradle Versions Plugin** if available
- Command: `./gradlew dependencyUpdates`
- Fallback: Direct parsing of `build.gradle`



## Usage Methods

### 1. Automated Webhook Triggers

The system automatically checks dependencies when:
- **Push events** modify dependency files (`pom.xml`, `build.gradle`)
- **Pull request events** contain dependency updates
- **Scheduled checks** run periodically

### 2. Manual Trigger via Issue Comment

Add a comment to any issue in your repository:
```
/check-dependencies
```

The bot will:
1. Check for outdated dependencies
2. Add a detailed comment with results
3. Create a pull request if updates are needed

### 3. Programmatic Usage

```javascript
import { JavaDependencyChecker } from './src/services/java-dependency-checker.js';

const checker = new JavaDependencyChecker(context);
const result = await checker.checkOutdatedDependencies(repoPath);

if (result.success) {
  console.log(`Found ${result.outdatedDependencies.length} outdated dependencies`);
}
```

### 4. Test Script

Run the included test script:
```bash
node test-java-dependencies.js
```

## Output Format

### Dependency Check Result
```javascript
{
  success: true,
  buildTool: 'maven',
  outdatedDependencies: [
    {
      groupId: 'org.slf4j',
      artifactId: 'slf4j-api',
      currentVersion: '2.0.16',
      latestVersion: '2.0.17',
      scope: 'compile',
      type: 'outdated'
    }
  ],
  report: {
          summary: {
        totalDependencies: 15,
        outdatedCount: 3,
        buildTool: 'maven'
      },
    recommendations: [
      {
        type: 'dependency_update',
        priority: 'medium',
        description: 'Update 3 outdated dependencies',
        action: 'Run dependency update command and test thoroughly'
      }
    ]
  }
}
```

## Update Commands

### Maven Commands
```bash
# Check for outdated dependencies
mvn versions:display-dependency-updates

# Update to latest versions
mvn versions:use-latest-versions

# Update to latest releases only
mvn versions:use-latest-releases

# Update to next releases
mvn versions:use-next-releases
```

### Gradle Commands
```bash
# Check for outdated dependencies
./gradlew dependencyUpdates

# Update to latest versions
./gradlew useLatestVersions

# Update to latest releases
./gradlew useLatestReleases
```

## Configuration

### Environment Variables
```bash
# Timeout settings (in milliseconds)
MAVEN_TIMEOUT=300000
GRADLE_TIMEOUT=300000

# Maximum concurrent checks
MAX_CONCURRENT_CHECKS=3
```

### Build Tool Configuration

#### Maven Versions Plugin
Add to your `pom.xml`:
```xml
<plugin>
    <groupId>org.codehaus.mojo</groupId>
    <artifactId>versions-maven-plugin</artifactId>
    <version>2.16.2</version>
</plugin>
```

#### Gradle Versions Plugin
Add to your `build.gradle`:
```groovy
plugins {
    id 'com.github.ben-manes.versions' version '0.50.0'
}
```



## Pull Request Creation

When outdated dependencies are found, the system creates a pull request with:

### PR Title
- `📦 Update Java dependencies (3 outdated)`
- `✅ Java dependencies are up to date`

### PR Body Contents
1. **Summary table** with dependency counts
2. **Outdated dependencies table** with current/latest versions
3. **Recommendations** with priority levels
4. **Manual update commands** for each build tool
5. **Testing instructions** specific to the build tool
6. **Next steps** and priority actions

### PR Labels
- `dependafix`
- `dependency-update`
- `automated`
- Build tool label (`maven` or `gradle`)
- Severity labels (`maintenance`)

## Error Handling

### Common Issues and Solutions

#### 1. Build Tool Not Detected
**Error**: `No supported build tool detected (Maven or Gradle)`
**Solution**: Ensure your project has `pom.xml` or `build.gradle` in the root directory

#### 2. Maven Versions Plugin Not Available
**Error**: `Maven warnings: BUILD FAILURE`
**Solution**: Add the Maven Versions Plugin to your `pom.xml`

#### 3. Gradle Versions Plugin Not Available
**Error**: `Gradle warnings: BUILD FAILED`
**Solution**: Add the Gradle Versions Plugin to your `build.gradle`



#### 4. Timeout Issues
**Error**: `Command timed out`
**Solution**: Increase timeout settings in configuration

## Best Practices

### 1. Regular Checks
- Set up scheduled dependency checks
- Keep dependencies up to date

### 2. Testing
- Always test after updating dependencies
- Run full test suite
- Check for breaking changes



### 3. Version Management
- Use version ranges carefully
- Prefer release versions over snapshots
- Document major version updates

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Dependency Check
on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 2 AM
  workflow_dispatch:  # Manual trigger

jobs:
  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          
      - name: Check Dependencies
        run: |
          # Trigger dependency check via API
          curl -X POST \
            -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
            -H "Accept: application/vnd.github.v3+json" \
            https://api.github.com/repos/${{ github.repository }}/dispatches \
            -d '{"event_type":"dependency-check"}'
```

### Jenkins Pipeline Example
```groovy
pipeline {
    agent any
    
    triggers {
        cron('0 2 * * 1')  // Every Monday at 2 AM
    }
    
    stages {
        stage('Dependency Check') {
            steps {
                script {
                    // Trigger dependency check
                    sh 'curl -X POST -H "Authorization: token ${GITHUB_TOKEN}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/${GITHUB_REPOSITORY}/dispatches \
                        -d \'{"event_type":"dependency-check"}\''
                }
            }
        }
    }
}
```

## Troubleshooting

### Debug Mode
Enable debug logging to see detailed information:
```javascript
const checker = new JavaDependencyChecker(context, {
  debug: true
});
```

### Manual Testing
Test individual components:
```bash
# Test build tool detection
node -e "
import('./src/services/java-dependency-checker.js').then(async ({JavaDependencyChecker}) => {
  const checker = new JavaDependencyChecker({log: console});
  const buildTool = await checker.detectBuildTool('./bacardi-main');
  console.log('Build tool:', buildTool);
});
"

# Test Maven dependency parsing
node -e "
import('./src/services/java-dependency-checker.js').then(async ({JavaDependencyChecker}) => {
  const checker = new JavaDependencyChecker({log: console});
  const deps = await checker.parsePomXmlDependencies('./bacardi-main');
  console.log('Dependencies:', deps);
});
"
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `No supported build tool detected` | Missing `pom.xml` or `build.gradle` | Add build configuration file |
| `BUILD FAILURE` | Missing Maven plugin | Add Maven Versions Plugin |
| `BUILD FAILED` | Missing Gradle plugin | Add Gradle Versions Plugin |
| `Command timed out` | Large project or slow network | Increase timeout settings |
| `Permission denied` | Missing execute permissions | Run `chmod +x gradlew` |

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the error logs in your application
3. Test with the provided test script
4. Create an issue in the repository

## Contributing

To contribute to the Java dependency checking system:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

The system is designed to be extensible and supports adding new build tools and dependency checkers. 