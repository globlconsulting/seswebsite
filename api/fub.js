const { initializeApp, getApps } = require("firebase/app");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
const { getFirestore, setDoc, doc, serverTimestamp } = require("firebase/firestore");
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
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const payload = req.body || {};

  // --- 1. Honeypot Validation for Spam Bots ---
  if (payload.website_url && payload.website_url.trim() !== '') {
    console.warn("Spam blocked via /api/fub honeypot validation:", payload.website_url);
    return res.status(200).json({ success: true, message: 'Data sent to FUB successfully' });
  }

  const person = payload.person || {};
  const firstName = (person.firstName || '').trim();
  const lastName = (person.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim() || 'Website Subscriber';
  const email = (person.emails && person.emails[0] && person.emails[0].value) ? person.emails[0].value.toLowerCase().trim() : '';
  const phone = (person.phones && person.phones[0] && person.phones[0].value) ? person.phones[0].value.trim() : '';
  const source = payload.source || 'SES Website - Newsletter';
  const isNewsletter = source.toLowerCase().includes('newsletter') || 
                       (Array.isArray(person.tags) && person.tags.some(t => t.toLowerCase().includes('newsletter')));

  if (!email) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }

  const FUB_API_KEY = process.env.FUB_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const adminPassword = process.env.ADMIN_AUTH_PASSWORD;

  // --- 2. Persist to Firestore (newsletter_subscribers collection) ---
  if (adminPassword) {
    try {
      await signInWithEmailAndPassword(auth, "got@globlconsulting.com", adminPassword);

      if (isNewsletter) {
        const subscriberData = {
          firstName: firstName,
          lastName: lastName,
          fullName: fullName,
          email: email,
          phone: phone,
          source: source,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        // Use clean email as doc ID to prevent duplicates while updating timestamp
        const cleanDocId = email.replace(/[^a-zA-Z0-9_-]/g, '_');
        await setDoc(doc(db, "newsletter_subscribers", cleanDocId), subscriberData, { merge: true });
      }
    } catch (dbErr) {
      console.error("Firestore persistence error in /api/fub:", dbErr);
    }
  }

  // --- 3. Submit to Follow Up Boss (FUB) ---
  if (FUB_API_KEY) {
    try {
      const authHeader = 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64');
      const tags = Array.isArray(person.tags) && person.tags.length > 0 
        ? person.tags 
        : ["SES_Newsletter_Subscriber", "Newsletter"];

      // 3a. Register Event in FUB
      const fubEventPayload = {
        source: source,
        system: payload.system || 'SES Website',
        type: payload.type || 'General Inquiry',
        message: payload.message || `Subscribed to Vetted Insights Newsletter on SES Website`,
        description: payload.description || `Newsletter Subscriber: ${fullName} (${email})`,
        person: {
          firstName: firstName,
          lastName: lastName,
          emails: [{ value: email, isPrimary: true }],
          ...(phone ? { phones: [{ value: phone, isPrimary: true }] } : {}),
          tags: tags
        }
      };

      const eventRes = await fetch('https://api.followupboss.com/v1/events', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'X-System': 'SES Website'
        },
        body: JSON.stringify(fubEventPayload)
      });

      if (!eventRes.ok) {
        const eventErr = await eventRes.text();
        console.warn("FUB Event API warning:", eventErr);
      }

      // 3b. Guarantee contact creation & tagging via /v1/people
      try {
        await fetch('https://api.followupboss.com/v1/people', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'X-System': 'SES Website'
          },
          body: JSON.stringify({
            firstName: firstName,
            lastName: lastName,
            emails: [{ value: email, isPrimary: true }],
            ...(phone ? { phones: [{ value: phone, isPrimary: true }] } : {}),
            tags: tags,
            source: source,
            stage: 'Lead'
          })
        });
      } catch (peopleErr) {
        console.warn("Direct FUB /v1/people creation fallback warning:", peopleErr);
      }

    } catch (fubError) {
      console.error("Follow Up Boss submission error:", fubError);
    }
  }

  // --- 4. Send Email Notification via Resend ---
  if (RESEND_API_KEY) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      
      const emailSubject = isNewsletter
        ? `New Newsletter Subscriber: ${fullName}`
        : `New Website Inquiry: ${fullName}`;

      const emailHtml = isNewsletter ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #c8a97e; border-bottom: 2px solid #c8a97e; padding-bottom: 10px; margin-top: 0;">New Newsletter Subscriber</h2>
          <p>A new user has subscribed to the <strong>Vetted Insights Newsletter</strong> on the SES Website.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 120px;">Name:</td>
              <td style="padding: 8px;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Email:</td>
              <td style="padding: 8px;"><a href="mailto:${email}" style="color: #c8a97e;">${email}</a></td>
            </tr>
            ${phone ? `
            <tr>
              <td style="padding: 8px; font-weight: bold;">Phone:</td>
              <td style="padding: 8px;">${phone}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px; font-weight: bold;">Source:</td>
              <td style="padding: 8px;">${source}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">CRM Status:</td>
              <td style="padding: 8px; color: #4ade80; font-weight: bold;">✓ Registered in Follow Up Boss (Tag: SES_Newsletter_Subscriber)</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8rem; color: #888; margin: 0;">This is an automated notification from the Sports & Entertainment Society Website.</p>
        </div>
      ` : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #c8a97e; border-bottom: 2px solid #c8a97e; padding-bottom: 10px; margin-top: 0;">New Website Inquiry</h2>
          <p>A new inquiry has been received from the SES Website.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold; width: 120px;">Name:</td>
              <td style="padding: 8px;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Email:</td>
              <td style="padding: 8px;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Source:</td>
              <td style="padding: 8px;">${source}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.8rem; color: #888; margin: 0;">This is an automated notification from the Sports & Entertainment Society Website.</p>
        </div>
      `;

      await resend.emails.send({
        from: 'SES Notifications <notifications@thesesociety.com>',
        to: 'got@globlconsulting.com',
        subject: emailSubject,
        html: emailHtml
      });
    } catch (emailErr) {
      console.error("Resend email notification error in /api/fub:", emailErr);
    }
  }

  return res.status(200).json({ success: true, message: 'Data sent to FUB successfully' });
};
