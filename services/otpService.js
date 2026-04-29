const nodemailer = require("nodemailer");
const OTP = require("../models/otpSchema");
const crypto = require("crypto");

/**
 * Service to manage One-Time Passwords (OTP)
 */
class OTPService {
  constructor() {
    this.transporter = null;
  }

  /**
   * Initializes the transporter if not already done
   */
  getTransporter() {
    if (!this.transporter) {
      const host = process.env.EMAIL_HOST || "smtp.gmail.com";
      const port = parseInt(process.env.EMAIL_PORT) || 587;
      
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("❌ EMAIL_USER or EMAIL_PASS is missing in .env");
      }

      console.log(`📡 Initializing mail transporter: ${host}:${port} (secure: ${port === 465})`);

      this.transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: port === 465, // true for 465, false for other ports (like 587)
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        // Increase timeouts for cloud environments like Render
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 15000,
        socketTimeout: 20000,
        // Force IPv4 if host is Gmail to avoid ENETUNREACH on IPv6
        ...(host.includes("gmail") ? { family: 4 } : {}),
      });
    }
    return this.transporter;
  }

  /**
   * Generates a 6-digit numeric OTP
   */
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Sends an OTP via Email
   */
  async sendEmailOTP(email, code, type = "email") {
    const isPasswordChange = type === "password_change";
    const subject = isPasswordChange 
      ? "Password Reset Code for GrainTox" 
      : "Verification Code for GrainTox";
    const actionText = isPasswordChange
      ? "changing your password"
      : "verifying your email address";

    const mailOptions = {
      from: `"GrainTox App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">${isPasswordChange ? "Reset Your Password" : "Verify Your Email"}</h2>
          <p style="font-size: 16px; color: #555;">Hello,</p>
          <p style="font-size: 16px; color: #555;">Use the following code for ${actionText}. This code is valid for 10 minutes.</p>
          <div style="background-color: #f7f7f7; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2d3436; border-radius: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p style="font-size: 14px; color: #888; text-align: center;">If you didn't request this code, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #aaa; text-align: center;">&copy; 2024 GrainTox App. All rights reserved.</p>
        </div>
      `,
    };

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`✅ OTP (${type}) sent to ${email}`);
      return true;
    } catch (error) {
      console.error("❌ Error sending email:", error.message);
      
      // Log the code anyway so the developer can see it in Render logs
      console.log(`[DEBUG] OTP Code for ${email}: ${code}`);
      
      // In development, we return true to allow testing without working email
      if (process.env.NODE_ENV === "Development") {
        return true;
      }
      
      // If we're on Render and getting ETIMEDOUT/ENETUNREACH, it's likely port blocking
      if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
        console.error("💡 TIP: Render blocks SMTP ports (25, 465, 587) on Free plans. Switch to a paid plan or use an API-based service like SendGrid/Resend.");
      }

      throw new Error(`Failed to send ${type} OTP email: ${error.message}`);
    }
  }

  /**
   * Saves and Sends OTP
   */
  async requestOTP(identifier, type, metadata = {}) {
    const code = this.generateOTP();
    
    // Delete any existing OTP for this identifier to avoid clutter
    await OTP.deleteMany({ identifier, type });

    // Save new OTP (will be hashed by pre-save hook)
    await OTP.create({
      identifier,
      code,
      type,
      metadata,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    if (type === "email" || type === "password_change") {
      return await this.sendEmailOTP(identifier, code, type);
    } else if (type === "phone") {
      // Placeholder: Logic for Firebase SMS Delivery Pipe would go here
      console.log(`[SMS PIPE] Redirecting to SMS provider for: ${identifier} with code: ${code}`);
      return true; // We assume the SMS will be handled by the frontend/bridge
    }
    
    throw new Error("Invalid OTP type");
  }

  /**
   * Verifies an OTP
   */
  async verifyOTP(identifier, code, type) {
    const otpRecord = await OTP.findOne({ identifier, type });

    if (!otpRecord) {
      return { success: false, message: "OTP expired or not found" };
    }

    const isValid = await otpRecord.verifyCode(code);
    if (!isValid) {
      return { success: false, message: "Invalid verification code" };
    }

    const metadata = otpRecord.metadata;

    // Note: Record is not deleted here because it may be used for a subsequent action 
    // (e.g., verifying then updating password). It will expire via TTL index.
    // await OTP.deleteOne({ _id: otpRecord._id });

    return { success: true, metadata };
  }
}

module.exports = new OTPService();
