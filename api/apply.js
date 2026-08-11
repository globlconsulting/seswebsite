const { initializeApp } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, collection, addDoc, serverTimestamp } = require("firebase/firestore");
const { Resend } = require("resend");

// Firebase client configuration (consistent with other API endpoints)
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

  // --- 1. Honeypot Validation (Spam Prevention) ---
  // If the hidden 'website_url' field is filled out, treat it as a silent success to trick the bot
  if (payload.website_url && payload.website_url.trim() !== "") {
    console.warn("Spam attempt blocked via Honeypot field:", payload.website_url);
    return res.status(200).json({ success: true, message: "Application submitted successfully." });
  }

  const { type } = payload; // 'csep' or 'membership'
  if (!type || (type !== 'csep' && type !== 'membership')) {
    return res.status(400).send("Invalid or missing application type.");
  }

  const FUB_API_KEY = process.env.FUB_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const adminPassword = process.env.ADMIN_AUTH_PASSWORD;

  if (!adminPassword) {
    console.error("Missing ADMIN_AUTH_PASSWORD on Vercel.");
    return res.status(500).send("Server configuration error.");
  }

  try {
    // --- 2. Authenticate as admin user in Firebase (Bypasses public create rule restrictions) ---
    await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);

    let appData = {};
    let fubPayload = {};
    let emailSubject = "";
    let emailHtml = "";
    let userEmail = "";
    let userFullName = "";

    if (type === 'csep') {
      const {
        firstName,
        lastName,
        email,
        industryValue,
        industryText,
        experienceValue,
        experienceText,
        experienceDetail,
        subscribeNewsletter
      } = payload;

      if (!firstName || !lastName || !email || !industryValue || !experienceValue) {
        return res.status(400).send("Missing required fields.");
      }

      userEmail = email.toLowerCase().trim();
      userFullName = `${firstName} ${lastName}`;

      // Build Firestore data
      appData = {
        email: userEmail,
        fullName: userFullName,
        phone: '',
        company: '',
        title: '',
        referrer: '',
        tier: 'sellebrity', // Default tier for CSEP applicants
        industries: [industryText],
        clientele: 'Athletes & Entertainers',
        experience: `[Years Exp: ${experienceText}]\n${experienceDetail}`,
        status: 'pending',
        applicationType: 'csep',
        createdAt: serverTimestamp()
      };

      // Build Follow Up Boss payload
      const tags = ["CSEP_Applicant", `Industry: ${industryValue}`];
      if (subscribeNewsletter) {
        tags.push("SES_Newsletter_Subscriber");
      }

      fubPayload = {
        person: {
          firstName,
          lastName,
          emails: [{ value: userEmail }],
          tags: tags
        },
        source: "SES Website - CSEP",
        system: "Custom",
        type: "Inquiry",
        message: `Years of experience: ${experienceValue}\nDetails: ${experienceDetail}`
      };

      emailSubject = "New Pending CSEP Application Submitted - Action Required";

    } else if (type === 'membership') {
      const {
        email,
        phone,
        fullName,
        company,
        title,
        referrer,
        tier,
        billing,
        industries,
        clientele,
        experience,
        headshotUrl,
        subscribeNewsletter
      } = payload;

      if (!email || !fullName || !company || !title || !phone || !clientele || !experience) {
        return res.status(400).send("Missing required fields.");
      }

      userEmail = email.toLowerCase().trim();
      userFullName = fullName;

      // Build Firestore data
      appData = {
        email: userEmail,
        fullName: userFullName,
        phone: phone,
        company: company,
        title: title,
        referrer: referrer,
        tier: tier,
        billing: billing || 'monthly',
        industries: industries || [],
        clientele: clientele,
        experience: experience,
        headshotUrl: headshotUrl || '',
        status: 'pending',
        createdAt: serverTimestamp()
      };

      // Build Follow Up Boss payload
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const tags = [
        "Membership_Applicant", 
        `Tier: ${tier}`, 
        `Billing: ${billing || 'monthly'}`,
        ...(industries || []).map(ind => `Industry: ${ind}`),
        `Clientele: ${clientele}`
      ];
      if (subscribeNewsletter) {
        tags.push("SES_Newsletter_Subscriber");
      }

      fubPayload = {
        person: {
          firstName,
          lastName,
          emails: [{ value: userEmail }],
          phones: [{ value: phone }],
          tags: tags
        },
        source: `SES Website - Membership`,
        system: "Custom",
        type: "Inquiry",
        message: `Company: ${company}\nTitle: ${title}\nReferrer: ${referrer}`
      };

      emailSubject = "New Pending Membership Application Submitted - Action Required";
    }

    // --- 3. Save to Firestore ---
    await addDoc(collection(db, "applications"), appData);

    // --- 4. Submit to Follow Up Boss (FUB) ---
    if (FUB_API_KEY) {
      try {
        const authHeader = 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64');
        await fetch('https://api.followupboss.com/v1/events', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'X-System': 'SES Website'
          },
          body: JSON.stringify(fubPayload)
        });
      } catch (fubErr) {
        console.error("CRM FUB submission failed:", fubErr);
      }
    }

    // --- 5. Send Email via Resend ---
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        await resend.emails.send({
          from: 'SES Hub <notifications@thesesociety.com>',
          to: 'got@globlconsulting.com',
          subject: emailSubject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #c8a97e; border-bottom: 2px solid #c8a97e; padding-bottom: 10px; margin-top: 0;">New Pending Application</h2>
              <p>A new application has been submitted to the <strong>Sports & Entertainment Society Hub</strong> and is currently awaiting approval.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; width: 120px;">Name:</td>
                  <td style="padding: 8px;">${userFullName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Email:</td>
                  <td style="padding: 8px;">${userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Type:</td>
                  <td style="padding: 8px;">${type.toUpperCase()} Application (${fubPayload.source})</td>
                </tr>
              </table>
              <p>Please log in to the <a href="https://thesesociety.com/login.html" style="color: #c8a97e; text-decoration: none; font-weight: bold;">Admin Control Center</a> to review and approve this applicant.</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 0.8rem; color: #888; margin: 0;">This is an automated notification from the Sports & Entertainment Society Website.</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error("Resend notification failed:", emailErr);
      }
    }

    return res.status(200).json({ success: true, message: "Application submitted successfully." });

  } catch (err) {
    console.error("Error processing application:", err);
    return res.status(500).send("Internal Server Error.");
  }
};
