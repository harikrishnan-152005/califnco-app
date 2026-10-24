
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const app = getAdminApp();
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!idToken) {
      return res.status(401).json({ error: "Missing authentication token" });
    }

    const decoded = await getAuth(app).verifyIdToken(idToken);

    if (decoded.admin !== true) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { orderId, status } = req.body || {};
    const allowedStatuses = [
      "Pending",
      "Confirmed",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
    ];

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({ error: "Invalid order ID or status" });
    }

    const db = getFirestore(app);
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderSnap.data();

    if (order.status === status) {
        return res.status(200).json({
            success: true,
            status,
            notificationsSent: 0,
            message: "Order already has this status.",
        });
    }

    await orderRef.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const userId = order.userId;
    let notificationsSent = 0;

    if (typeof userId === "string" && userId) {
      const tokensSnap = await db
        .collection("users")
        .doc(userId)
        .collection("pushTokens")
        .get();

      const messages = tokensSnap.docs
        .map((doc) => doc.data().token)
        .filter((token) => typeof token === "string" && token.startsWith("ExponentPushToken["))
        .map((to) => ({
          to,
          sound: "default",
          channelId: "default",
          title: "Order Update",
          body: `Your order status is now ${status}.`,
          data: { orderId, status },
        }));

      for (let i = 0; i < messages.length; i += 100) {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });

        if (!response.ok) {
          console.error("Expo push request failed:", await response.text());
          continue;
        }

        const result = await response.json();
        notificationsSent += (result.data || []).filter(
          (ticket) => ticket.status === "ok"
        ).length;
      }
    }

    return res.status(200).json({
      success: true,
      status,
      notificationsSent,
    });
  } catch (error) {
    console.error("Order status API error:", error);
    return res.status(500).json({ error: "Unable to update order status" });
  }
};
