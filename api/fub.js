export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const FUB_API_KEY = process.env.FUB_API_KEY;

  if (!FUB_API_KEY) {
    console.error("Missing FUB_API_KEY environment variable.");
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const payload = req.body;

    // Follow Up Boss expects Basic Auth with the API key as the username and an empty password
    const authHeader = 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64');

    // Make the request to Follow Up Boss /v1/events endpoint
    // This automatically creates or updates the contact based on email, and adds the tags/notes
    const fubResponse = await fetch('https://api.followupboss.com/v1/events', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'X-System': 'SES Website'
      },
      body: JSON.stringify(payload)
    });

    if (!fubResponse.ok) {
      const errorText = await fubResponse.text();
      console.error("Follow Up Boss API Error:", errorText);
      return res.status(fubResponse.status).json({ error: 'Failed to send data to CRM' });
    }

    const data = await fubResponse.json();

    // Parse details for email notification
    const person = payload.person || {};
    const firstName = person.firstName || '';
    const lastName = person.lastName || '';
    const email = (person.emails && person.emails[0] && person.emails[0].value) || 'No email provided';

    // Send email notification to got@globlconsulting.com via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'SES Hub <notifications@thesesociety.com>',
            to: 'got@globlconsulting.com',
            subject: 'New Pending Application Submitted - Action Required',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #c8a97e; border-bottom: 2px solid #c8a97e; padding-bottom: 10px; margin-top: 0;">New Pending Application</h2>
                <p>A new application has been submitted to the <strong>Sports & Entertainment Society Hub</strong> and is currently awaiting approval.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr>
                    <td style="padding: 8px; font-weight: bold; width: 120px;">Name:</td>
                    <td style="padding: 8px;">${firstName} ${lastName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; font-weight: bold;">Email:</td>
                    <td style="padding: 8px;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; font-weight: bold;">Type:</td>
                    <td style="padding: 8px;">${payload.source || 'Membership Application'}</td>
                  </tr>
                </table>
                <p>Please log in to the <a href="https://thesesociety.com/login.html" style="color: #c8a97e; text-decoration: none; font-weight: bold;">Admin Control Center</a> to review and approve this applicant.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 0.8rem; color: #888; margin: 0;">This is an automated notification from the Sports & Entertainment Society Website.</p>
              </div>
            `
          })
        });
      } catch (emailErr) {
        console.error("Error sending email notification via Resend:", emailErr);
      }
    }

    return res.status(200).json({ success: true, message: 'Data sent to FUB successfully' });

  } catch (error) {
    console.error("Error processing form submission:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
