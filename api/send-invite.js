const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc, updateDoc, serverTimestamp, query, collection, where, limit, getDocs } = require("firebase/firestore");
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

// Helper to verify if the caller is an authenticated admin
async function verifyAdmin(req, db, firebaseConfig) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!token) {
    return { authenticated: false, error: "Missing authorization token." };
  }

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });

    if (!response.ok) {
      return { authenticated: false, error: "Invalid authorization token." };
    }

    const lookupData = await response.json();
    const user = lookupData.users && lookupData.users[0];
    if (!user) {
      return { authenticated: false, error: "User not found." };
    }

    const email = (user.email || "").toLowerCase().trim();
    const uid = user.localId;

    const adminEmails = [
      "sheena.l@rhiveconstruction.com",
      "got@globlconsulting.com",
      "kofi@globlconsulting.com",
      "admin@ses.com"
    ];

    if (adminEmails.includes(email)) {
      return { authenticated: true, uid, email };
    }

    // Check users collection in Firestore
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      if (data.role === 'admin' || data.isAdmin === true) {
        return { authenticated: true, uid, email };
      }
    }

    return { authenticated: false, error: "Access denied: User is not an admin." };
  } catch (err) {
    console.error("verifyAdmin helper error:", err);
    return { authenticated: false, error: "Error verifying admin token." };
  }
}

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
    // 1. Verify caller is admin
    const adminCheck = await verifyAdmin(req, db, firebaseConfig);
    if (!adminCheck.authenticated) {
      console.warn("Unauthorized attempt to call send-invite:", adminCheck.error);
      return res.status(403).send(adminCheck.error);
    }

    // 2. Authenticate in Firebase as got@globlconsulting.com
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

    // 4. Update inviteSentAt in approved_emails doc
    await updateDoc(approvedDocRef, {
      inviteSentAt: serverTimestamp()
    });

    // 5. Update inviteSentAt in applications doc
    const q = query(collection(db, "applications"), where("email", "==", approvedEmail), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const appDoc = querySnapshot.docs[0];
      await updateDoc(doc(db, "applications", appDoc.id), {
        inviteSentAt: serverTimestamp()
      });
    }

    console.log(`Manually sent registration email to: ${approvedEmail}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending manual invite:", err);
    return res.status(500).send("Error sending email.");
  }
};
