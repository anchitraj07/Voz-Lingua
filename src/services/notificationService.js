const PUBLIC_VAPID_KEY = "BN1AXGrJTaZf7H29xjs6aYnRFtB1oEIAbOAIjCaegE5-pM1eREncIZmpHv3jfqda8-yTiDNBgYxZMWi_-AI6FlU";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const subscribeAdminToPush = async () => {
  if (!("serviceWorker" in navigator)) return alert("Service Worker not supported");

  try {
    const register = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    
    const subscription = await register.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });

    await fetch("/.netlify/functions/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: { "Content-Type": "application/json" },
    });

    alert("Admin successfully subscribed to Web Push Notifications!");
  } catch (error) {
    console.error("Failed to subscribe to push", error);
    alert("Failed to subscribe. Check console for details.");
  }
};

export const notifyNewDemo = async (demoData) => {
  try {
    await fetch("/.netlify/functions/book-demo", {
      method: "POST",
      body: JSON.stringify(demoData),
      headers: { "Content-Type": "application/json" },
    });
    console.log("Demo booked and notification triggered.");
  } catch (error) {
    console.error("Failed to send demo data:", error);
  }
};
