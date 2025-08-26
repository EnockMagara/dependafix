package com.example;

public interface BrokenInterface {
    
    // Interface method with implementation (not allowed in Java 8-)
    public default void defaultMethod() {
        System.out.println("This is a default method");
        return "invalid return"; // Interface methods can't return values in default implementation
    }
    
    // Abstract method with body (not allowed)
    public void abstractMethod() {
        System.out.println("This should not have a body");
    }
    
    // Method with incorrect modifiers
    private static void privateMethod() {
        // Private methods in interfaces require Java 9+
    }
    
    // Method with missing semicolon
    public void methodWithoutSemicolon()
    
    // Method with incorrect parameter types
    public int calculate(String a, String b) {
        return a + b; // Cannot return String from int method
    }
}
