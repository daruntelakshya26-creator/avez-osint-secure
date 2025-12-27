// api/query.js - Secure Vercel Serverless Function
const fetch = require('node-fetch');

// Configuration - API key from environment variable
const API_BASE_URL = 'https://leakosintapi.com/';
const API_TOKEN = process.env.API_TOKEN || '8513993113:x5Zx70lb'; // Fallback for local dev
const REQUEST_TIMEOUT = 15000;

// Retry logic
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 'Error code': 'Method not allowed' });
  }

  try {
    // Parse request body
    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ 'Error code': 'Invalid JSON in request' });
    }

    if (!data) {
      return res.status(400).json({ 'Error code': 'No data provided' });
    }

    // Extract parameters from frontend
    const query = data.request || data.query || '';
    const limit = data.limit || 300;
    const lang = data.lang || 'ru';

    if (!query) {
      return res.status(400).json({ 'Error code': 'Query parameter is required' });
    }

    // SECURE: Add API token from environment variable
    const payload = {
      token: API_TOKEN, // From environment, NOT from frontend
      request: query,
      limit: limit,
      lang: lang
    };

    // Forward request to the real API
    const response = await fetchWithRetry(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const apiResponse = await response.json();
    
    // Return the API response
    return res.status(200).json(apiResponse);

  } catch (error) {
    console.error('Proxy error:', error);
    
    // Determine appropriate status code
    let statusCode = 500;
    let errorMessage = error.message || 'Internal server error';
    
    if (error.message.includes('timeout') || error.message.includes('abort')) {
      statusCode = 504;
      errorMessage = 'Request timeout';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      statusCode = 502;
      errorMessage = 'Network error';
    }
    
    return res.status(statusCode).json({ 
      'Error code': `Backend error: ${errorMessage}` 
    });
  }
};
