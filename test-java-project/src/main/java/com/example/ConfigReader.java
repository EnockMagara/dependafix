package com.example;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.net.URL;
import java.net.MalformedURLException;
import java.io.File;
import java.nio.charset.Charset;

public class ConfigReader {
    
    private Properties properties;
    
    public ConfigReader() {
        properties = new Properties();
        loadProperties();
    }
    
    private void loadProperties() {
        try (InputStream input = getClass().getClassLoader().getResourceAsStream("application.properties")) {
            if (input == null) {
                throw new RuntimeException("Cannot find application.properties");
            }
            properties.load(input);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    public void validateConfiguration() {
        // Validate port number
        try {
            int port = Integer.parseInt(properties.getProperty("server.port", "8080"));
            if (port < 1 || port > 65535) {
                throw new IllegalArgumentException("Invalid port number: " + port);
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid port format");
        }
        
        // Validate boolean values
        try {
            boolean debug = Boolean.parseBoolean(properties.getProperty("app.debug", "false"));
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid boolean value for app.debug");
        }
        
        // Validate timeout
        try {
            int timeout = Integer.parseInt(properties.getProperty("app.timeout", "30"));
            if (timeout < 0) {
                throw new IllegalArgumentException("Invalid timeout value: " + timeout);
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid timeout format");
        }
        
        // Validate URL
        try {
            String url = properties.getProperty("app.externalUrl");
            if (url != null) {
                new URL(url);
            }
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("Invalid URL format");
        }
        
        // Validate file path
        try {
            String logFile = properties.getProperty("app.logFile");
            if (logFile != null) {
                new File(logFile);
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid file path");
        }
        
        // Validate encoding
        try {
            String encoding = properties.getProperty("app.encoding", "UTF-8");
            Charset.forName(encoding);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid encoding: " + properties.getProperty("app.encoding", "UTF-8"));
        }
        
        // Validate memory settings
        try {
            String maxMemory = properties.getProperty("app.maxMemory");
            if (maxMemory != null) {
                // This will fail for invalid memory format
                parseMemorySize(maxMemory);
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid memory format");
        }
        
        // Validate thread pool size
        try {
            int threadPoolSize = Integer.parseInt(properties.getProperty("app.threadPoolSize", "10"));
            if (threadPoolSize <= 0) {
                throw new IllegalArgumentException("Invalid thread pool size: " + threadPoolSize);
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid thread pool size format");
        }
        
        // Validate SSL configuration
        try {
            boolean sslEnabled = Boolean.parseBoolean(properties.getProperty("app.ssl.enabled", "false"));
            if (sslEnabled) {
                String keystore = properties.getProperty("app.ssl.keystore");
                if (keystore == null || keystore.isEmpty()) {
                    throw new IllegalArgumentException("SSL enabled but no keystore specified");
                }
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid SSL configuration");
        }
        
        // Validate logging configuration
        try {
            String logLevel = properties.getProperty("logging.level.root", "INFO");
            if (!isValidLogLevel(logLevel)) {
                throw new IllegalArgumentException("Invalid log level: " + logLevel);
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid logging configuration");
        }
        
        // Validate cache configuration
        try {
            String ttl = properties.getProperty("cache.ttl");
            if (ttl != null) {
                parseTimeFormat(ttl);
            }
            
            int maxSize = Integer.parseInt(properties.getProperty("cache.maxSize", "100"));
            if (maxSize < 0) {
                throw new IllegalArgumentException("Invalid cache max size: " + maxSize);
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid cache configuration");
        }
        
        // Validate email configuration
        try {
            int smtpPort = Integer.parseInt(properties.getProperty("email.smtp.port", "587"));
            if (smtpPort < 1 || smtpPort > 65535) {
                throw new IllegalArgumentException("Invalid SMTP port: " + smtpPort);
            }
            
            boolean smtpAuth = Boolean.parseBoolean(properties.getProperty("email.smtp.auth", "true"));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid email configuration");
        }
    }
    
    private long parseMemorySize(String memory) {
        // This method will fail for invalid memory formats
        if (memory.endsWith("MB")) {
            return Long.parseLong(memory.substring(0, memory.length() - 2)) * 1024 * 1024;
        } else if (memory.endsWith("GB")) {
            return Long.parseLong(memory.substring(0, memory.length() - 2)) * 1024 * 1024 * 1024;
        } else {
            return Long.parseLong(memory);
        }
    }
    
    private boolean isValidLogLevel(String level) {
        return level.equals("DEBUG") || level.equals("INFO") || 
               level.equals("WARN") || level.equals("ERROR");
    }
    
    private long parseTimeFormat(String time) {
        // This method will fail for invalid time formats
        if (time.endsWith("s")) {
            return Long.parseLong(time.substring(0, time.length() - 1)) * 1000;
        } else if (time.endsWith("m")) {
            return Long.parseLong(time.substring(0, time.length() - 1)) * 60 * 1000;
        } else if (time.endsWith("h")) {
            return Long.parseLong(time.substring(0, time.length() - 1)) * 60 * 60 * 1000;
        } else {
            return Long.parseLong(time);
        }
    }
}
