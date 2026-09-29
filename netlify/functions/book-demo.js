const webpush = require("web-push");
const { getStore } = require("@netlify/blobs");

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "BN1AXGrJTaZf7H29xjs6aYnRFtB1oEIAbOAIjCaegE5-pM1eREncIZmpHv3jfqda8-yTiDNBgYxZMWi_-AI6FlU";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "Wy3L6tI3eE7j-N63Nje0Ufdfv4eZeFj-onJR318cvjg";

// Replace with a real email for the VAPID details
webpush.setVapidDetails("mailto:admin@vozlingua.com", publicVapidKey, privateVapidKey);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { name, email, program } = JSON.parse(event.body);

    const store = getStore("push-subscriptions");
    const adminSubscription = await store.getJSON("admin_sub");

    if (adminSubscription) {
      const payload = JSON.stringify({
        title: "New Demo Booked! 🎉",
        body: `Name: ${name}\nEmail: ${email}\nProgram: ${program}`,
      });

      await webpush.sendNotification(adminSubscription, payload);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Demo booked successfully." }),
    };
  } catch (error) {
    console.error("Error sending push notification:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process demo booking." }),
    };
  }
};
