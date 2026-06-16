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
    return res.status(200).json({ success: true, message: 'Data sent to FUB successfully' });

  } catch (error) {
    console.error("Error processing form submission:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
