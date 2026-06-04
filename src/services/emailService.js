const nodemailer = require('nodemailer');
const { t } = require('../utils/i18n');
const User = require('../models/User');

// Create transporter with timeout
const createTransporter = async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certs
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });

  return transporter;
};

/**
 * Send OTP for password reset
 */
const sendPasswordResetOTP = async (email, otp, name) => {
  try {
    const transporter = await createTransporter();
    
    // Attempt to get user's language
    const user = await User.findOne({ email }).select('preferredLanguage');
    const lang = user ? user.preferredLanguage : 'en';

    const subject = t('email.passwordReset.subject', lang);
    const title = t('email.passwordReset.title', lang);
    const intro = t('email.passwordReset.intro', lang);
    const bestRegards = lang === 'el' ? 'Με εκτίμηση,<br>Η ομάδα του TruckFlow' : 'Best regards,<br>TruckFlow Team';
    const otpLabel = lang === 'el' ? 'Ο κωδικός OTP σας' : 'Your OTP Code';
    const expireNote = lang === 'el' ? 'Αυτός ο κωδικός OTP θα λήξει σε 10 λεπτά.' : 'This OTP will expire in 10 minutes.';
    const ignoreNote = lang === 'el' ? 'Εάν δεν το ζητήσατε εσείς, παρακαλώ αγνοήστε αυτό το email.' : 'If you didn\'t request this, please ignore this email.';

    const mailOptions = {
      from: `"TruckFlow" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #facc15; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .otp-box { background: #fff; border: 2px dashed #facc15; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #000; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; color: #000;">TruckFlow</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>Hi ${name},</p>
              <p>${intro}</p>
              
              <div class="otp-box">
                <p style="margin: 0; color: #666;">${otpLabel}</p>
                <div class="otp-code">${otp}</div>
              </div>
              
              <p><strong>${expireNote}</strong></p>
              <p>${ignoreNote}</p>
              
              <p>${bestRegards}</p>
            </div>
            <div class="footer">
              <p>© 2026 TruckFlow. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset OTP sent to:', email);
    return true;
  } catch (error) {
    console.error('Error sending password reset OTP:', error);
    throw error;
  }
};

/**
 * Send driver invitation email with setup link
 */
const sendDriverInvitation = async (email, name, token, lang = 'en') => {
  try {
    const transporter = await createTransporter();
    const setupLink = `${process.env.FRONTEND_URL}/auth/setup-password?token=${token}`;

    const subject = t('email.driverInvitation.subject', lang);
    const title = t('email.driverInvitation.title', lang);
    const intro = t('email.driverInvitation.intro', lang);
    const buttonText = lang === 'el' ? 'Ορίστε τον κωδικό σας' : 'Set Your Password';
    const orText = lang === 'el' ? 'Ή αντιγράψτε και επικολλήστε αυτόν τον σύνδεσμο στο πρόγραμμα περιήγησής σας:' : 'Or copy and paste this link in your browser:';
    const expireNote = lang === 'el' ? 'Αυτός ο σύνδεσμος θα λήξει σε 24 ώρες.' : 'This link will expire in 24 hours.';
    const loginEmailLabel = lang === 'el' ? 'Το email σύνδεσής σας:' : 'Your login email:';
    const afterSetNote = lang === 'el' ? 'Αφού ορίσετε τον κωδικό σας, μπορείτε να συνδεθείτε στην εφαρμογή TruckFlow και να ξεκινήσετε τη διαχείριση των φορτίων σας.' : 'After setting your password, you can sign in to the TruckFlow app and start managing your loads.';
    const bestRegards = lang === 'el' ? 'Με εκτίμηση,<br>Η ομάδα του TruckFlow' : 'Best regards,<br>TruckFlow Team';

    const mailOptions = {
      from: `"TruckFlow" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #facc15; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #000; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; color: #000;">TruckFlow</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>Hi ${name},</p>
              <p>${intro}</p>
              
              <div style="text-align: center;">
                <a href="${setupLink}" class="button">${buttonText}</a>
              </div>
              
              <p>${orText}</p>
              <p style="background: #fff; padding: 10px; border-radius: 4px; word-break: break-all;">${setupLink}</p>
              
              <p><strong>${expireNote}</strong></p>
              
              <p>${loginEmailLabel} <strong>${email}</strong></p>
              
              <p>${afterSetNote}</p>
              
              <p>${bestRegards}</p>
            </div>
            <div class="footer">
              <p>© 2026 TruckFlow. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Driver invitation sent to:', email);
    return true;
  } catch (error) {
    console.error('Error sending driver invitation:', error);
    throw error;
  }
};

/**
 * Send email notification for load-related events
 */
const sendLoadNotificationEmail = async (user, load, context, driverName = '') => {
  try {
    const transporter = await createTransporter();
    const loadNum = load.loadNumber || load._id.toString().slice(-8).toUpperCase();
    
    // Attempt to get user's language
    const recipient = await User.findOne({ email: user.email }).select('preferredLanguage');
    const lang = recipient ? recipient.preferredLanguage : 'en';

    // Determine localized content
    const subject = t(`email.load.subject_${context}`, lang, { loadNumber: loadNum, userName: driverName || user.name });
    const title = t(`email.load.title_${context}`, lang, { loadNumber: loadNum, userName: driverName || user.name });
    const intro = t(`email.load.intro_${context}`, lang, { loadNumber: loadNum, userName: driverName || user.name });

    // Labels
    const loadNumberLabel = lang === 'el' ? 'Αριθμός Φορτίου:' : 'Load Number:';
    const pickupLabel = lang === 'el' ? 'Παραλαβή:' : 'Pickup:';
    const dropoffLabel = lang === 'el' ? 'Παράδοση:' : 'Dropoff:';
    const dateLabel = lang === 'el' ? 'Ημερομηνία:' : 'Date:';
    const timeLabel = lang === 'el' ? 'Ώρα:' : 'Time:';
    const weightLabel = lang === 'el' ? 'Βάρος:' : 'Weight:';
    const viewButtonText = lang === 'el' ? 'Προβολή Λεπτομερειών Φορτίου' : 'View Load Details';
    const bestRegards = lang === 'el' ? 'Με εκτίμηση,<br>Η ομάδα του TruckFlow' : 'Best regards,<br>TruckFlow Team';

    const mailOptions = {
      from: `"TruckFlow" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `${subject} - TruckFlow`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #facc15; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .details-box { background: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .detail-label { font-weight: bold; color: #666; }
            .detail-value { text-align: right; }
            .button { display: inline-block; background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; color: #000;">TruckFlow</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>Hi ${user.name},</p>
              <p>${intro}</p>
              
              <div class="details-box">
                <div class="detail-row">
                  <span class="detail-label">${loadNumberLabel}</span>
                  <span class="detail-value">#${loadNum}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${pickupLabel}</span>
                  <span class="detail-value">${load.pickupLocation}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${dropoffLabel}</span>
                  <span class="detail-value">${load.dropoffLocation}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${dateLabel}</span>
                  <span class="detail-value">${new Date(load.loadingDate).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-US')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${timeLabel}</span>
                  <span class="detail-value">${load.loadingTime}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${weightLabel}</span>
                  <span class="detail-value">${load.loadWeight} kg</span>
                </div>
              </div>
              
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/load/${load._id}" class="button">${viewButtonText}</a>
              </div>
              
              <p>${bestRegards}</p>
            </div>
            <div class="footer">
              <p>© 2026 TruckFlow. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Load email (${context}) sent to:`, user.email);
    return true;
  } catch (error) {
    console.error(`Error sending load email (${context}):`, error);
    return false;
  }
};

/**
 * Send email notification for route-related events
 */
const sendRouteNotificationEmail = async (user, route, context = 'assigned', driverName = '') => {
  try {
    const transporter = await createTransporter();
    const routeNum = route.routeNumber || `R-${route._id.toString().slice(-8).toUpperCase()}`;

    // Attempt to get user's language
    const recipient = await User.findOne({ email: user.email }).select('preferredLanguage');
    const lang = recipient ? recipient.preferredLanguage : 'en';

    const subject = t(`email.route.subject_${context}`, lang, { routeName: route.routeName, driverName: driverName || user.name });
    const title = t(`email.route.title_${context}`, lang, { routeName: route.routeName, driverName: driverName || user.name });
    const intro = t(`email.route.intro_${context}`, lang, { routeName: route.routeName, driverName: driverName || user.name });

    // Labels
    const routeLabel = lang === 'el' ? 'Διαδρομή:' : 'Route:';
    const idLabel = lang === 'el' ? 'ID:' : 'ID:';
    const startDateLabel = lang === 'el' ? 'Ημερομηνία Έναρξης:' : 'Start Date:';
    const loadsLabel = lang === 'el' ? 'Φορτία:' : 'Loads:';
    const viewButtonText = lang === 'el' ? 'Προβολή Λεπτομερειών' : 'View Details';
    const bestRegards = lang === 'el' ? 'Με εκτίμηση,<br>Η ομάδα του TruckFlow' : 'Best regards,<br>TruckFlow Team';

    const mailOptions = {
      from: `"TruckFlow" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `${subject} - TruckFlow`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #facc15; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .details-box { background: #fff; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .detail-label { font-weight: bold; color: #666; }
            .detail-value { text-align: right; }
            .button { display: inline-block; background: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; color: #000;">TruckFlow</h1>
            </div>
            <div class="content">
              <h2>${title}</h2>
              <p>Hi ${user.name},</p>
              <p>${intro}</p>
              
              <div class="details-box">
                <div class="detail-row">
                  <span class="detail-label">${routeLabel}</span>
                  <span class="detail-value">${route.routeName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${idLabel}</span>
                  <span class="detail-value">${routeNum}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${startDateLabel}</span>
                  <span class="detail-value">${new Date(route.startDate).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-US')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${loadsLabel}</span>
                  <span class="detail-value">${route.loads ? route.loads.length : 0}</span>
                </div>
              </div>
              
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/routes" class="button">${viewButtonText}</a>
              </div>
              
              <p>${bestRegards}</p>
            </div>
            <div class="footer">
              <p>© 2026 TruckFlow. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Route assignment email sent to:', user.email);
    return true;
  } catch (error) {
    console.error('Error sending route assignment email:', error);
    return false;
  }
};

module.exports = {
  sendPasswordResetOTP,
  sendDriverInvitation,
  sendLoadNotificationEmail,
  sendRouteNotificationEmail,
};
