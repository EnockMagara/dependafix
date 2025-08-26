package com.example;

import java.util.List;
import java.util.ArrayList;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Syntax error: missing semicolon
        String message = "This is a test"
        
        // Type mismatch error
        int number = "not a number";
        
        // Undefined variable error
        System.out.println(undefinedVariable);
        
        // Method call on null object
        String nullString = null;
        nullString.length();
        
        // Array access out of bounds
        int[] array = new int[5];
        int value = array[10];
        
        // Missing import for Date
        Date today = new Date();
        
        // Incorrect method call
        List<String> list = new ArrayList<>();
        list.add("item");
        list.nonExistentMethod();
    }
    
    // Method with missing return statement
    public int getValue() {
        if (true) {
            return 42;
        }
        // Missing return statement for else case
    }
    
    // Method with unreachable code
    public void unreachableCode() {
        return;
        System.out.println("This will never execute");
    }
}
