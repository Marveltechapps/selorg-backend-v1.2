// Test POST to send OTP for a specific phone number (same endpoint as Rider app: /api/signin/send-otp)
const PHONE = process.argv[2] || "7418268091";
const PORT = process.env.PORT || 5001;
const URL = `http://localhost:${PORT}/api/signin/send-otp`;

(async () => {
  try {
    const mobile = String(PHONE).replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) {
      console.error("Usage: node send_otp_number.js [10-digit-number]");
      process.exit(1);
    }
    console.log("Sending OTP to", mobile, "via", URL);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobileNumber: mobile })
    });
    const text = await res.text();
    console.log("HTTP STATUS:", res.status);
    console.log(text);
    if (!res.ok) process.exit(1);
  } catch (err) {
    console.error("Request failed:", err);
    process.exit(1);
  }
})();

