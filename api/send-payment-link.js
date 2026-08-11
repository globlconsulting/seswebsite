const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, getDoc, updateDoc, serverTimestamp } = require("firebase/firestore");
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

const STRIPE_LINKS = {
  sellebrity: {
    monthly: 'https://buy.stripe.com/dRm28s4lB5oB4Oo7kpak000',
    yearly: 'https://buy.stripe.com/9B6fZi3hx3gt80AfQVak001'
  },
  guild: {
    monthly: 'https://buy.stripe.com/4gM00k3hxg3feoY5chak002',
    yearly: 'https://buy.stripe.com/5kQ3cw5pFaIV1CcbAFak003'
  },
  council: {
    monthly: 'https://buy.stripe.com/8x2aEY05leZb1Cc6glak005',
    yearly: 'https://buy.stripe.com/fZudRaaJZ9ER0y85chak004'
  },
  vendor: {
    monthly: 'https://buy.stripe.com/9B6aEYbO32cpeoYdINak006'
  }
};

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

  const { appId, isYearly } = req.body || {};
  if (!appId) {
    return res.status(400).send("Missing appId parameter.");
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
      console.warn("Unauthorized attempt to call send-payment-link:", adminCheck.error);
      return res.status(403).send(adminCheck.error);
    }

    // 2. Authenticate in Firebase
    await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);    // 2. Fetch the application document to verify
    const appDocRef = doc(db, "applications", appId);
    const appDocSnap = await getDoc(appDocRef);

    if (!appDocSnap.exists()) {
      return res.status(404).send("Application not found.");
    }

    const appData = appDocSnap.data();
    const appEmail = (appData.email || "").trim().toLowerCase();
    const appName = appData.fullName || "Member";
    const appTier = appData.tier || "general";

    if (appTier === 'general') {
      return res.status(400).send("General Membership is free and does not require a payment link.");
    }

    const planType = isYearly ? 'yearly' : 'monthly';
    const stripeLink = STRIPE_LINKS[appTier] && STRIPE_LINKS[appTier][planType];

    if (!stripeLink) {
      return res.status(400).send(`Stripe link for tier "${appTier}" (${planType}) is not configured.`);
    }

    const prefilledLink = `${stripeLink}?prefilled_email=${encodeURIComponent(appEmail)}`;
    const tierName = appTier === 'vendor' ? 'Featured Vendor' : appTier === 'sellebrity' ? 'Sellebrity' : appTier === 'guild' ? 'Sellebrity Guild' : 'Sellebrity Council';
    const billingTerm = isYearly ? 'Yearly' : 'Monthly';
    
    // Add trial notice to email if Sellebrity Council
    let trialText = '';
    if (appTier === 'council') {
      trialText = ' (includes a 365-day free trial on approval)';
    }

    // 3. Send the payment link email using Resend
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #c8a97e; text-align: center;">Your SES Application is Approved!</h2>
        <p>Hello ${appName},</p>
        <p>Congratulations! Your application for the <strong>${tierName} Membership</strong> at the Sports & Entertainment Society has been reviewed and approved.</p>
        <p>To activate your membership, please complete the secure payment of your <strong>${billingTerm} subscription plan${trialText}</strong> by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${prefilledLink}" style="background-color: #c8a97e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold; display: inline-block;">Complete Payment & Registration</a>
        </div>
        <p style="font-size: 0.9rem; color: #666; word-break: break-all;">Or copy and paste this link in your browser:<br/>
        <a href="${prefilledLink}" style="color: #c8a97e;">${prefilledLink}</a></p>
        <p style="font-size: 0.85rem; color: #888; margin-top: 20px;">Once paid, you will receive an automated email containing your official registration link to create your account and access the Society Hub.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
        <p>We look forward to welcoming you inside the Society.</p>
        <p>Best regards,<br/><strong>The Sports & Entertainment Society Team</strong></p>
      </div>
    `;

    await resend.emails.send({
      from: "Sports & Entertainment Society <membership@thesesociety.com>",
      to: [appEmail],
      subject: "Your SES Application is Approved - Complete Registration",
      html: emailHtml
    });

    // 4. Update status and tracking fields in applications doc
    await updateDoc(appDocRef, {
      status: 'awaiting_payment',
      billing: planType,
      paymentLinkSentAt: serverTimestamp()
    });

    console.log(`Successfully sent payment link email to: ${appEmail}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending payment link:", err);
    return res.status(500).send("Error sending payment email.");
  }
};
