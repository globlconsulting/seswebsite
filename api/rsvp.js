const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, collection, addDoc, serverTimestamp } = require("firebase/firestore");

// Firebase client configuration
const firebaseConfig = {
  apiKey: "AIzaSyCKHFiOX_OPFbHRNE7zM_KI7hQdspq01vc",
  authDomain: "ses-website-970b6.firebaseapp.com",
  projectId: "ses-website-970b6",
  storageBucket: "ses-website-970b6.firebasestorage.app",
  messagingSenderId: "881775307006",
  appId: "1:881775307006:web:3b07b5d77d4837be511daf",
  measurementId: "G-WVS7VP0QZF"
};

// Initialize Firebase client
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const payload = req.body || {};

  // --- 1. Honeypot Validation ---
  if (payload.website_url && payload.website_url.trim() !== "") {
    console.warn("Spam RSVP attempt blocked via Honeypot field.");
    return res.status(200).json({ success: true, message: "RSVP submitted successfully." });
  }

  const { eventId, eventName, fullName, email } = payload;

  if (!eventId || !eventName || !fullName || !email) {
    return res.status(400).send("Missing required fields.");
  }

  const adminPassword = process.env.ADMIN_AUTH_PASSWORD;
  if (!adminPassword) {
    console.error("Missing ADMIN_AUTH_PASSWORD on Vercel.");
    return res.status(500).send("Server configuration error.");
  }

  try {
    // --- 2. Authenticate as admin user in Firebase ---
    await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);

    // --- 3. Save RSVP to Firestore ---
    const rsvpData = {
      eventId,
      eventName,
      fullName,
      email: email.toLowerCase().trim(),
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, "rsvps"), rsvpData);

    return res.status(200).json({ success: true, message: "RSVP submitted successfully." });
  } catch (err) {
    console.error("Error saving RSVP:", err);
    return res.status(500).send("Internal Server Error.");
  }
};
