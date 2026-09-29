const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const subscription = JSON.parse(event.body);
    
    // Using Netlify Blobs to store the subscription (zero config)
    const store = getStore("push-subscriptions");
    
    // In this basic version, we only store the single "admin" subscription
    await store.setJSON("admin_sub", subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Subscription saved successfully." }),
    };
  } catch (error) {
    console.error("Error saving subscription:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to save subscription." }),
    };
  }
};
