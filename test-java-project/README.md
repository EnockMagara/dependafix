# Test Java Project for Breaking Change Detection

This is a test Java project designed to demonstrate the Java Breaking Change Detector functionality. The project contains various compilation errors, dependency issues, and breaking changes to test error detection capabilities.

## Compilation Errors Included

### Java Source Code Errors
1. **Syntax Errors**: Missing semicolons, brackets, and invalid syntax
2. **Type Mismatches**: Assigning incompatible types
3. **Undefined Variables**: Using variables that don't exist
4. **Missing Imports**: Using classes without proper imports
5. **Method Signature Issues**: Incorrect method calls and signatures
6. **Interface Violations**: Incorrect interface implementations
7. **Exception Handling**: Unhandled exceptions and incorrect exception types
8. **Array Issues**: Out-of-bounds access and incorrect array syntax
9. **Null Pointer Issues**: Calling methods on null objects
10. **Unreachable Code**: Code that can never be executed

### Dependency Breaking Changes
1. **Outdated Dependencies**: Using very old versions of libraries
2. **Missing Dependencies**: Dependencies that don't exist in Maven Central
3. **Version Conflicts**: Incompatible dependency versions
4. **Security Vulnerabilities**: Dependencies with known security issues
5. **Java Version Incompatibilities**: Dependencies removed from Java 11+
6. **API Breaking Changes**: Using deprecated or removed API methods
7. **Logging Framework Conflicts**: Multiple logging frameworks causing conflicts

### Configuration Errors
1. **Invalid Properties**: Malformed property values
2. **XML Syntax Errors**: Malformed XML configuration files
3. **Invalid File Paths**: Non-existent or invalid file references
4. **Invalid URLs**: Malformed URL formats
5. **Invalid Port Numbers**: Port numbers outside valid range
6. **Invalid Boolean Values**: Non-boolean values in boolean fields
7. **Invalid Number Formats**: Non-numeric values in numeric fields

## Files with Errors

### Java Source Files
- `src/main/java/com/example/App.java` - Multiple syntax and type errors
- `src/main/java/com/example/Calculator.java` - Method signature and array errors
- `src/main/java/com/example/Utils.java` - Missing returns and incorrect API usage
- `src/main/java/com/example/BrokenInterface.java` - Interface implementation errors
- `src/main/java/com/example/DependencyTest.java` - Dependency breaking changes
- `src/main/java/com/example/ConfigReader.java` - Configuration validation errors

### Test Files
- `src/test/java/com/example/AppTest.java` - Test compilation errors
- `src/test/java/com/example/DependencyTestTest.java` - Dependency test errors

### Configuration Files
- `src/main/resources/config.xml` - Malformed XML
- `src/main/resources/application.properties` - Invalid property values
- `malformed-pom.xml` - Malformed Maven POM file

## Running the Project

To see all compilation errors, run:
```bash
mvn compile
```

To run tests (will also show errors):
```bash
mvn test
```

## Expected Errors

The project should produce:
- Multiple compilation errors during `mvn compile`
- Dependency resolution failures
- Test compilation failures
- Configuration validation errors
- Runtime exceptions when attempting to execute

This project serves as a comprehensive test suite for detecting various types of compilation errors and breaking changes in Java projects.
