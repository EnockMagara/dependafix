package com.example;

import com.google.common.collect.Lists;
import com.google.common.base.Preconditions;
import org.apache.commons.lang3.StringUtils;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.Marshaller;
import org.apache.commons.fileupload.FileItem;
import org.apache.commons.fileupload.disk.DiskFileItemFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.support.ClassPathXmlApplicationContext;
import org.apache.log4j.Logger;
import org.slf4j.LoggerFactory;

public class DependencyTest {
    
    // Using old Guava API that has breaking changes
    public void testGuavaBreakingChanges() {
        // Old Guava Lists.newArrayList() method (deprecated in newer versions)
        Lists.newArrayList("item1", "item2", "item3");
        
        // Old Guava Preconditions.checkNotNull() method
        Preconditions.checkNotNull("test", "message");
        
        // Using deprecated Guava methods
        com.google.common.base.Objects.toStringHelper("test");
    }
    
    // Using old Apache Commons Lang API
    public void testCommonsLangBreakingChanges() {
        // Old StringUtils methods that have changed
        StringUtils.isBlank("test");
        StringUtils.isEmpty("test");
        
        // Using deprecated methods
        StringUtils.defaultString(null, "default");
    }
    
    // Using JAXB which is removed from Java 11+
    public void testJAXBBreakingChanges() {
        try {
            JAXBContext context = JAXBContext.newInstance(String.class);
            Marshaller marshaller = context.createMarshaller();
            marshaller.marshal("test", System.out);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    
    // Using vulnerable Commons FileUpload
    public void testFileUploadBreakingChanges() {
        try {
            DiskFileItemFactory factory = new DiskFileItemFactory();
            // This version has security vulnerabilities
            FileItem item = factory.createItem("fieldName", "text/plain", false, "fileName");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    
    // Using old Spring API
    public void testSpringBreakingChanges() {
        try {
            // Old Spring ApplicationContext usage
            ApplicationContext context = new ClassPathXmlApplicationContext("config.xml");
            Object bean = context.getBean("testBean");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    
    // Using conflicting logging frameworks
    public void testLoggingBreakingChanges() {
        // Log4j logger
        Logger log4jLogger = Logger.getLogger(DependencyTest.class);
        log4jLogger.info("Log4j message");
        
        // SLF4J logger
        org.slf4j.Logger slf4jLogger = LoggerFactory.getLogger(DependencyTest.class);
        slf4jLogger.info("SLF4J message");
        
        // This will cause conflicts between logging frameworks
    }
    
    // Using non-existent dependency methods
    public void testNonExistentDependency() {
        // These methods don't exist and will cause compilation errors
        // com.nonexistent.FakeLibrary.doSomething();
        // com.nonexistent.FakeLibrary.getData();
    }
    
    // Method that demonstrates version conflicts
    public void testVersionConflicts() {
        // Using methods that may have different signatures in different versions
        String result = StringUtils.capitalize("test");
        
        // Using Guava methods that may have changed
        com.google.common.collect.ImmutableList.of("a", "b", "c");
    }
}
