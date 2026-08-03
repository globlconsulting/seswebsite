const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc } = require("firebase/firestore");
const { Resend } = require("resend");

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

  const { email } = req.body || {};
  if (!email) {
    return res.status(400).send("Missing email parameter.");
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const adminPassword = process.env.ADMIN_AUTH_PASSWORD;

  if (!resendApiKey || !adminPassword) {
    console.error("Missing configuration variables on Vercel.");
    return res.status(500).send("Server configuration error.");
  }

  const resend = new Resend(resendApiKey);

  try {
    // 1. Authenticate in Firebase as got@globlconsulting.com
    await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);

    // 2. Double-check that the email is actually approved in Firestore (Security Check!)
    const approvedEmail = email.trim().toLowerCase();
    const approvedDocRef = doc(db, "approved_emails", approvedEmail);
    const approvedDocSnap = await getDoc(approvedDocRef);

    if (!approvedDocSnap.exists()) {
      console.warn(`Unauthorized attempt to send invite to unapproved email: ${approvedEmail}`);
      return res.status(403).send("This email has not been approved yet.");
    }

    const userData = approvedDocSnap.data();
    const customerName = userData.name || "Member";
    const tier = userData.membershipTier || "general";
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

    // 3. Send the registration email using Resend
    const registerUrl = `https://thesesociety.com/login.html?register=true&email=${encodeURIComponent(approvedEmail)}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #c8a97e; text-align: center;">Welcome to the Sports & Entertainment Society!</h2>
        <p>Hello ${customerName},</p>
        <p>Congratulations! Your application for the <strong>${tierName} Membership</strong> at the Sports & Entertainment Society has been reviewed and approved.</p>
        <p>You can now register your account and access the Society Hub by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${registerUrl}" style="background-color: #c8a97e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; display: inline-block;">Register Your Account</a>
        </div>
        <p style="font-size: 0.9rem; color: #666; word-break: break-all;">Or copy and paste this link in your browser:<br/>
        <a href="${registerUrl}" style="color: #c8a97e;">${registerUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
        <p>We look forward to connecting with you inside the Society Hub.</p>
        <p>Best regards,<br/><strong>The Sports & Entertainment Society Team</strong></p>
      </div>
    `;

    await resend.emails.send({
      from: "Sports & Entertainment Society <membership@thesesociety.com>",
      to: [approvedEmail],
      subject: "Welcome to the Sports & Entertainment Society - Register Your Account",
      html: emailHtml
    });

    console.log(`Manually sent registration email to: ${approvedEmail}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending manual invite:", err);
    return res.status(500).send("Error sending email.");
  }
};
