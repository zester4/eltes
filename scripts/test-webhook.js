// Using native fetch available in Node.js 18+

async function testWebhook() {
  const url = 'https://ce3d-154-160-5-16.ngrok-free.app/api/composio/webhook';
  
  // Mock V3 Payload from Composio
  const payload = {
    id: "evt_12345",
    timestamp: new Date().toISOString(),
    type: "composio.trigger.message",
    metadata: {
      user_id: 'c0ba3b56-d803-4b7f-9b58-7185c57e071b',
      trigger_slug: 'gmail_new_gmail_message',
      connected_account_id: "acc_123"
    },
    data: {
      subject: "Test Email from Composio",
      body: "This is a test message to verify the proactive agent."
    }
  };

  console.log("Sending mock V3 webhook to:", url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': 'evt_12345',
        'webhook-signature': 'mock_signature',
        'webhook-timestamp': payload.timestamp,
        'x-composio-webhook-id': 'evt_12345',
        'x-composio-signature': 'mock_signature',
        'x-composio-webhook-timestamp': payload.timestamp,
        'x-skip-verification': 'true'
      },
      body: JSON.stringify(payload)
    });

    console.log("Response Status:", response.status);
    const text = await response.text();
    console.log("Response Text:", text);
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

testWebhook();
