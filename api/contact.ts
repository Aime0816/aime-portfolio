// import type { Request, Response } from "express";
// export default function handler(req: Request, res: Response) {
//   res.setHeader("Cache-Control", "no-store");
//   if (req.method !== "POST") {
//     res.setHeader("Allow", "POST");
//     return res.status(405).json({ error: "Use POST." });
//   }
//   return res
//     .status(503)
//     .json({
//       success: false,
//       error:
//         "Email delivery is not configured. Please email aime200816@gmail.com directly. No message has been sent.",
//     });
// }

import type { Request, Response } from "express";



export default async function handler(
  req: Request,
  res: Response
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const { name, email, subject, message } = req.body || {};

    // 1. Validate required fields
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof message !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Please complete all required fields."
      });
    }

    const emailAddress = email.trim();

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    // Limit input sizes
    if (
      name.length > 150 ||
      emailAddress.length > 254 ||
      message.length > 5000 ||
      (subject != null &&
        (typeof subject !== "string" || subject.length > 200))
    ) {
      return res.status(400).json({
        error: "One or more fields are too long."
      });
    }

    
// 3. Check server configuration
const apiKey = process.env.ABSTRACT_API_KEY?.trim();
const apiUrl = process.env.ABSTRACT_API_URL?.trim();
const formspree = process.env.FORMSPREE_ENDPOINT?.trim();

console.log("Contact backend configuration:", {
  workingDirectory: process.cwd(),
  processId: process.pid,
  ABSTRACT_API_KEY: Boolean(apiKey),
  ABSTRACT_API_URL: Boolean(apiUrl),
  FORMSPREE_ENDPOINT: Boolean(formspree)
});

if (!apiKey || !apiUrl || !formspree) {
  return res.status(500).json({
    success: false,
    error: "Contact service is not configured."
  });
}

    // 4. Verify email using Abstract API
    const url = new URL(apiUrl);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("email", emailAddress);

    const verificationResponse = await fetch(url, {
      signal: AbortSignal.timeout(15000)
    });

    if (!verificationResponse.ok) {
      return res.status(503).json({
        error: "Email verification is temporarily unavailable."
      });
    }

    const verification = await verificationResponse.json();

    // Support both Abstract API response formats
    const status = String(
      verification.email_deliverability?.status ??
      verification.deliverability ??
      "unknown"
    ).toLowerCase();

    const isDisposable =
      verification.email_quality?.is_disposable ??
      verification.is_disposable_email?.value ??
      verification.is_disposable_email === true;

    // 5. Reject disposable emails
    if (isDisposable) {
      return res.status(422).json({
        error: "Temporary email addresses are not allowed."
      });
    }

    // 6. Reject undeliverable emails
    if (status === "undeliverable") {
      return res.status(422).json({
        error: "This email address appears to be invalid."
      });
    }

    // Reject emails whose deliverability cannot be confirmed
    if (status !== "deliverable") {
      return res.status(422).json({
        error: "We could not verify this email. Please check it or try another address."
      });
    }

    // 7. Forward accepted message to Formspree
    const formResponse = await fetch(formspree, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: name.trim(),
        email: emailAddress,
        subject: subject?.trim() || "Portfolio enquiry",
        message: message.trim()
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!formResponse.ok) {
      return res.status(502).json({
        error: "Unable to submit your message. Please try again."
      });
    }

    // 8. Return success
    return res.status(200).json({
      success: true,
      message: "Message submitted successfully!"
    });

  } catch (error) {
    return res.status(500).json({
      error: "Contact service is temporarily unavailable."
    });
  }
}