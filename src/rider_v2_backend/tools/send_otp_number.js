// Test POST to send OTP for a specific phone number
(async () => {
  try {
    const phone = "8925494404";
    const res = await fetch("http://localhost:5002/api/v1/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone })
    });
    const text = await res.text();
    console.log("HTTP STATUS:", res.status);
    console.log(text);
  } catch (err) {
    console.error("Request failed:", err);
    process.exit(1);
  }
})();

