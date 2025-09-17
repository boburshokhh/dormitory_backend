const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

// Переменные окружения с fallback значениями
const PARTNER_KEY = process.env.PARTNER_KEY || '28896788';
const PARTNER_SECRET = process.env.PARTNER_SECRET || '53KH1HXUrMmIu1lKb9CT';
const ARTEMIS_HOST = process.env.ARTEMIS_HOST || '192.168.1.112';

const instance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

async function makeArtemisRequest(resourcePath, requestBody, method = 'POST') {
  try {
    const accept = 'application/json';
    const contentType = 'application/json';
    const timestamp = Date.now().toString();
    const nonce = uuidv4();
    const signatureHeaders = 'x-ca-key,x-ca-nonce,x-ca-timestamp';

    const stringToSign = [
      method,
      accept,
      contentType,
      `x-ca-key:${PARTNER_KEY}`,
      `x-ca-nonce:${nonce}`,
      `x-ca-timestamp:${timestamp}`,
      resourcePath,
    ].join('\n');

    const signature = crypto
      .createHmac('sha256', PARTNER_SECRET)
      .update(stringToSign)
      .digest('base64');

    const headers = {
      Accept: accept,
      'Content-Type': contentType,
      'x-ca-key': PARTNER_KEY,
      'x-ca-timestamp': timestamp,
      'x-ca-nonce': nonce,
      'x-ca-signature': signature,
      'x-ca-signature-headers': signatureHeaders,
    };

    const url = `https://${ARTEMIS_HOST}${resourcePath}`;

    const verb = (method || 'POST').toUpperCase();
    const response = verb === 'GET'
      ? await instance.get(url, { headers, params: requestBody || {} })
      : await instance.post(url, requestBody, { headers });

    if (response.data && response.data.code && response.data.code != 0) {
      throw new Error(response.data.msg || 'Hikvision API error');
    }
    return response.data;
  } catch (error) {
    if (error.response?.data) console.error('Response data:', error.response.data);
    throw new Error(error.response?.data || error.message);
  }
}

async function faddUserHikcentral({ url, method = 'POST', data = {}, description = null }) {
  const startTime = Date.now();
  try {
    const response = await makeArtemisRequest(url, data, method);
    const responseTime = Date.now() - startTime;
    return {
      success: true,
      data: response,
      status: 200,
      responseTime,
      description: description || undefined,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      status: error.response?.status || 500,
      message: error.response?.data || error.message,
      error: error.message,
      responseTime,
    };
  }
}

async function addUserHikcentral(requestBody) {
  const RESOURCE_PATH = '/artemis/api/resource/v1/person/single/add';
  return makeArtemisRequest(RESOURCE_PATH, requestBody);
}

module.exports = {
  makeArtemisRequest,
  faddUserHikcentral,
  addUserHikcentral,
};


