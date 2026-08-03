const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, doc, setDoc, query, collection, where, limit, getDocs, updateDoc, serverTimestamp } = require("firebase/firestore");
const Stripe = require("stripe");
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

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const adminPassword = process.env.ADMIN_AUTH_PASSWORD; // Password for admin@ses.com

  if (!stripeSecretKey || !stripeWebhookSecret || !resendApiKey || !adminPassword) {
    console.error("Missing configuration variables on Vercel.");
    return res.status(500).send("Server configuration error.");
  }

  const stripe = new Stripe(stripeSecretKey);
  const resend = new Resend(resendApiKey);

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Read raw body from Vercel's incoming request stream
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_details ? session.customer_details.email : null;
    const customerName = session.customer_details ? session.customer_details.name : "Member";

    if (!customerEmail) {
      console.error("No customer email found in checkout session.");
      return res.status(400).send("No customer email in session.");
    }

    try {
      // 1. Authenticate in Firebase as got@globlconsulting.com (bypasses service account key requirement!)
      await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);
      console.log("Logged into Firebase successfully as admin.");

      // 2. Determine membership tier from line items
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      let purchasedDescription = "";
      if (lineItems.data && lineItems.data.length > 0) {
        purchasedDescription = lineItems.data[0].description.toLowerCase();
      }

      let tier = "sellebrity"; // Default fallback
      if (purchasedDescription.includes("guild")) {
        tier = "guild";
      } else if (purchasedDescription.includes("council")) {
        tier = "council";
      } else if (purchasedDescription.includes("vendor")) {
        tier = "vendor";
      }

      console.log(`Processing approval for: ${customerEmail}, Tier: ${tier}`);

      // 3. Write to Firestore approved_emails collection (authorized by rules for admin@ses.com)
      const approvedEmail = customerEmail.trim().toLowerCase();
      await setDoc(doc(db, "approved_emails", approvedEmail), {
        email: approvedEmail,
        name: customerName,
        membershipTier: tier,
        approvedAt: serverTimestamp(),
        registered: false
      });

      // 4. Search and update application status to 'approved'
      const q = query(collection(db, "applications"), where("email", "==", approvedEmail), limit(1));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const appDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "applications", appDoc.id), { status: "approved" });
        console.log(`Updated application status to approved for: ${approvedEmail}`);
      } else {
        console.log(`No pending application found in database for: ${approvedEmail}`);
      }

      // 5. Send welcome email using Resend
      const registerUrl = `https://thesesociety.com/login.html?register=true&email=${encodeURIComponent(approvedEmail)}`;
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #c8a97e; text-align: center;">Welcome to the Sports & Entertainment Society!</h2>
          <p>Hello ${customerName},</p>
          <p>Congratulations! Your payment was successful, and your application for the <strong>${tierName} Membership</strong> has been approved.</p>
          <p>You can now register your account and unlock access to the Society Hub by clicking the button below:</p>
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
        subject: "Your Application Approved - Register Your Account",
        html: emailHtml
      });

      console.log(`Sent registration email to: ${approvedEmail}`);
      return res.status(200).send("Webhook handled successfully.");
    } catch (dbErr) {
      console.error("Error writing approval or sending email:", dbErr);
      return res.status(500).send("Internal server processing error.");
    }
  }

  return res.status(200).send("Event received.");
};

// Enable raw body parser for Stripe signature verification
module.exports.config = {
  api: {
    bodyParser: false
  }
};
