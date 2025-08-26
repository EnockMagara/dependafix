package com.example;

import java.util.*;
import java.io.*;

public class Utils {
    
    // Static method with compilation error
    public static String processString(String input) {
        // Missing return statement
        if (input == null) {
            return null;
        }
        // No return for non-null case
    }
    
    // Method with incorrect generic syntax
    public static List<String> createList() {
        List<String> list = new ArrayList<String>(); // Raw type warning
        list.add("item1");
        list.add("item2");
        return list;
    }
    
    // Method with file I/O error
    public static void readFile(String filename) {
        try {
            File file = new File(filename);
            FileReader reader = new FileReader(file);
            BufferedReader br = new BufferedReader(reader);
            
            String line;
            while ((line = br.readLine()) != null) {
                System.out.println(line);
            }
            
            // Missing resource cleanup
            // br.close() and reader.close() should be called
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    // Method with incorrect enum usage
    public static void enumTest() {
        // Undefined enum
        DayOfWeek day = DayOfWeek.MONDAY;
        
        // Incorrect enum comparison
        if (day == "MONDAY") { // Should use equals() or == DayOfWeek.MONDAY
            System.out.println("It's Monday!");
        }
    }
    
    // Method with incorrect lambda syntax
    public static void lambdaTest() {
        List<String> names = Arrays.asList("Alice", "Bob", "Charlie");
        
        // Incorrect lambda syntax
        names.forEach(name -> {
            System.out.println(name)
        }); // Missing semicolon
        
        // Incorrect stream usage
        names.stream()
             .filter(name -> name.length() > 3)
             .map(name -> name.toUpperCase())
             .collect(Collectors.toList()); // Missing import for Collectors
    }
    
    // Method with incorrect annotation
    @Override
    public static void overriddenMethod() {
        // This method cannot be overridden as it's static
        System.out.println("This is wrong");
    }
    
    // Method with incorrect exception declaration
    public static void exceptionTest() throws RuntimeException {
        throw new Exception("This should be RuntimeException"); // Wrong exception type
    }
}
