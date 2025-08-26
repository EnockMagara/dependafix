package com.example;

public class Calculator {
    // Missing access modifier
    int result;
    
    // Constructor with syntax error
    public Calculator() {
        this.result = 0
    }
    
    // Method with parameter type mismatch
    public int add(String a, int b) {
        return a + b; // Type mismatch: String + int
    }
    
    // Method with undefined method call
    public double divide(int a, int b) {
        return Math.divide(a, b); // Math.divide doesn't exist
    }
    
    // Method with incorrect array syntax
    public void processArray() {
        int[] numbers = new int[5];
        numbers[0] = 1;
        numbers[1] = 2;
        numbers[2] = 3;
        numbers[3] = 4;
        numbers[4] = 5;
        
        // Incorrect array access
        int value = numbers[5]; // Array index out of bounds
        
        // Incorrect array declaration
        int[] invalidArray = new int[3] {1, 2, 3}; // Missing semicolon
    }
    
    // Method with missing exception handling
    public void riskyOperation() throws Exception {
        throw new Exception("This is a test exception");
    }
    
    // Method that calls riskyOperation without handling exception
    public void callRiskyOperation() {
        riskyOperation(); // Unhandled exception
    }
    
    // Method with incorrect variable declaration
    public void variableTest() {
        int x = 5;
        int x = 10; // Duplicate variable declaration
        
        final int constant = 42;
        constant = 100; // Cannot assign to final variable
    }
}
