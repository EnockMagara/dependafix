#!/usr/bin/env python3

import os
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

def test_openai_connection():
    """Test OpenAI API connection"""
    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=os.getenv('API_KEY'))
        
        print("🧪 Testing OpenAI connection...")
        print(f"🔑 API Key: {os.getenv('API_KEY')[:20]}...")
        
        # Test with a simple prompt
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Use a cheaper model for testing
            messages=[
                {"role": "system", "content": "You are a Java dependency expert."},
                {"role": "user", "content": "How would you fix a deprecated method issue in Java?"}
            ],
            max_tokens=150,
            temperature=0.3
        )
        
        print("✅ OpenAI connection successful!")
        print(f"📝 Response: {response.choices[0].message.content}")
        
        return True
        
    except Exception as e:
        print(f"❌ OpenAI connection failed: {e}")
        return False

if __name__ == "__main__":
    success = test_openai_connection()
    exit(0 if success else 1) 