package com.example;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppTest {
    
    @Test
    public void testAddition() {
        // Missing import for Calculator class
        Calculator calc = new Calculator();
        
        // Incorrect assertion method
        assertEquals(5, calc.add("2", 3)); // Type mismatch
        
        // Undefined method call
        calc.nonExistentMethod();
        
        // Incorrect test annotation
        @Test
        public void invalidTest() {
            // This is invalid - nested method
        }
    }
    
    @Test
    public void testDivision() {
        Calculator calc = new Calculator();
        
        // Division by zero
        double result = calc.divide(10, 0);
        
        // Incorrect assertion
        assertTrue(result == 0); // Should use assertEquals
    }
    
    // Missing @Test annotation
    public void testWithoutAnnotation() {
        // This test won't run
        assertTrue(true);
    }
    
    // Method with syntax error
    @Test
    public void testWithError() {
        String message = "Test message"
        assertNotNull(message); // Missing semicolon above
    }
    
    // Test with incorrect exception handling
    @Test(expected = Exception.class)
    public void testException() {
        Calculator calc = new Calculator();
        calc.callRiskyOperation(); // This should throw exception
    }
}
