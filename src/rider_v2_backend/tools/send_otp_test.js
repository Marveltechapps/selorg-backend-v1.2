// Simple script to POST to the send-otp endpoint for testing
(async () => {
  try {
    const res = await fetch("http://localhost:5002/api/v1/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+15555550123" })
    });
    const text = await res.text();
    console.log("HTTP STATUS:", res.status);
    console.log(text);
  } catch (err) {
    console.error("Request failed:", err);
    process.exit(1);
  }
})();

