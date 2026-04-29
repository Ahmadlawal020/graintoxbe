const { Resend } = require("resend");
const OTP = require("../models/otpSchema");
const crypto = require("crypto");

/**
 * Service to manage One-Time Passwords (OTP)
 */
class OTPService {
  constructor() {
    this.resend = null;
  }

  /**
   * Initializes the Resend client if not already done
   */
  getResend() {
    if (!this.resend) {
      if (!process.env.RESEND_API_KEY) {
        console.error("❌ RESEND_API_KEY is missing in .env");
      }
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
    return this.resend;
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

    try {
      const resend = this.getResend();
      
      // Note: If you haven't verified your domain on Resend, 
      // you must use 'onboarding@resend.dev' and can only send to your own email.
      const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

      const { data, error } = await resend.emails.send({
        from: `GrainTox <${fromEmail}>`,
        to: [email],
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
      });

      if (error) {
        throw error;
      }

      console.log(`✅ OTP (${type}) sent to ${email} via Resend (ID: ${data.id})`);
      return true;
    } catch (error) {
      console.error("❌ Error sending email via Resend:", error.message || error);
      
      // Log the code anyway so the developer can see it in Render logs
      console.log(`[DEBUG] OTP Code for ${email}: ${code}`);
      
      // In development, we return true to allow testing without working email
      if (process.env.NODE_ENV === "Development") {
        return true;
      }
      
      throw new Error(`Failed to send ${type} OTP email: ${error.message || "Unknown error"}`);
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
