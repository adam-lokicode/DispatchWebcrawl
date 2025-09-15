const OpenAI = require('openai');

/**
 * OpenAI Vision API Client for analyzing DAT ONE screenshots
 * This handles the actual AI vision API calls for load extraction
 */
class OpenAIVisionClient {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        
        this.openai = new OpenAI({
            apiKey: apiKey
        });
    }

    /**
     * Analyze a screenshot using OpenAI GPT-4V
     * @param {string} base64Image - Base64 encoded image
     * @param {string} prompt - Analysis prompt
     * @returns {Promise<string>} AI response
     */
    async analyzeScreenshot(base64Image, prompt) {
        try {
            console.log('🤖 Sending screenshot to OpenAI Vision API...');
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o", // Using GPT-4o which has vision capabilities
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`,
                                    detail: "high" // High detail for better accuracy
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 4000,
                temperature: 0.1, // Low temperature for consistent extraction
                response_format: { type: "text" }
            });

            const content = response.choices[0]?.message?.content;
            
            if (!content) {
                throw new Error('No content in OpenAI response');
            }

            console.log('✅ OpenAI analysis completed');
            console.log(`📊 Tokens used: ${response.usage?.total_tokens || 'unknown'}`);
            
            return content;

        } catch (error) {
            console.error('❌ OpenAI Vision API error:', error.message);
            
            // Handle specific API errors
            if (error.status === 401) {
                throw new Error('Invalid OpenAI API key');
            } else if (error.status === 429) {
                throw new Error('OpenAI API rate limit exceeded');
            } else if (error.status === 400) {
                throw new Error('Invalid request to OpenAI API');
            }
            
            throw error;
        }
    }

    /**
     * Analyze screenshot with retry logic
     * @param {string} base64Image - Base64 encoded image
     * @param {string} prompt - Analysis prompt
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<string>} AI response
     */
    async analyzeScreenshotWithRetry(base64Image, prompt, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.analyzeScreenshot(base64Image, prompt);
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                
                // Don't retry on authentication errors
                if (error.status === 401) {
                    throw error;
                }
                
                // Wait before retrying (exponential backoff)
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.log(`⏳ Waiting ${delay/1000}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Test the API connection
     * @returns {Promise<boolean>} True if API is working
     */
    async testConnection() {
        try {
            // Create a simple test image (1x1 pixel PNG)
            const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "What do you see in this image? Just say 'test successful'."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${testImage}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 50
            });

            console.log('✅ OpenAI API connection test successful');
            return true;

        } catch (error) {
            console.error('❌ OpenAI API connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Get model information and pricing
     */
    getModelInfo() {
        return {
            model: 'gpt-4o',
            description: 'GPT-4 with vision capabilities',
            inputPricing: '$5.00 per 1M tokens',
            outputPricing: '$15.00 per 1M tokens',
            contextWindow: '128K tokens',
            imageSupport: true,
            maxImageSize: '20MB',
            supportedFormats: ['PNG', 'JPEG', 'WEBP', 'GIF']
        };
    }
}

module.exports = OpenAIVisionClient;
