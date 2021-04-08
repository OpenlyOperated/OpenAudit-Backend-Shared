const AppError = require("../error.js");
const Logger = require("../logger.js");

const DOMAIN = process.env.DOMAIN;
const NODE_ENV = process.env.NODE_ENV;
const EMAIL_SALT = process.env.EMAIL_SALT;

const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");

const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const AWS = require("aws-sdk");
const awsSesClient = new AWS.SES({
  apiVersion: "2010-12-01",
  region: "us-east-1"
});

module.exports = {

  // === Main
  sendConfirmation: (toAddress, code) => {
    let emailEncoded = encodeURIComponent(toAddress)
    return send(
      `hi@${DOMAIN}`,
      toAddress,
      "Click to Confirm Email",
      "confirm-email", {
        confirmemailurl: `https://${DOMAIN}/confirm-email?email=${emailEncoded}&code=${code}`
      }
    );
  },

  sendChangeEmailConfirmation: (toAddress, code) => {
    let emailEncoded = encodeURIComponent(toAddress)
    return send(
      `hi@${DOMAIN}`,
      toAddress,
      "Click to Confirm Change of Email",
      "confirm-change-email", {
        confirmemailurl: `https://${DOMAIN}/confirm-change-email?email=${emailEncoded}&code=${code}`
      }
    );
  },

  sendResetPassword: (toAddress, code) => {
    return send(
      `hi@${DOMAIN}`,
      toAddress,
      "Your Request to Reset Password",
      "reset-password", {
        reseturl: `https://${DOMAIN}/reset-password?code=${code}`
      }
    );
  },

  // === Admin
  sendAuditAlert: (toAddress, action, reason) => {
    return send(
      `hi@${DOMAIN}`,
      toAddress,
      "Account Action Notification",
      "audit-alert", {
        action: action,
        reason: reason,
        time: new Date()
      }
    );
  },

  sendConfirmationAdmin: (toAddress, code) => {
    return send(
      `admin@${DOMAIN}`,
      toAddress,
      "Click to Confirm Email",
      "confirm-admin-email", {
        confirmemailurl: `https://admin.${DOMAIN}/confirm-email?code=${code}`
      }
    );
  },

  sendAdminAlert: (subject, body) => {
    Logger.info(`Sending Admin Email
      SUBJECT: ${subject}
      BODY: ${body}`);
    return sendPlain(
      `admin@${DOMAIN}`,
      `admin@${DOMAIN}`,
      `ADMIN ALERT: ${subject}`,
      body
    );
  },

};

function send(fromAddress, toAddress, subject, templateName, parameters) {
  var html, text, optOutLink;
  var emailHashed = Secure.sha512(toAddress, EMAIL_SALT);
  var doNotEmail = false;
  return Database.query(
      `SELECT do_not_email, do_not_email_code
    FROM users
    WHERE email = $1
    LIMIT 1`,
      [emailHashed])
    .catch(error => {
      Logger.error("Error getting do not email or do not email code: " + error);
    })
    .then(result => {
      var optOutCode = "";
      if (result && result.rows[0]) {
        doNotEmail = result.rows[0].do_not_email;
        optOutCode = result.rows[0].do_not_email_code;
      }
      optOutLink = `https://${DOMAIN}/do-not-email?email=${toAddress}&code=${optOutCode}`;
      return getCompiledEmail(`${templateName}.html`, parameters)
    })
    .then(result => {
      html = result + `<div style="width=100%; text-align:center;"><a href="${optOutLink}" style="font-size: 10px; text-decoration: underline; color: gray;">Email Opt-Out</a></div>`;
      return getCompiledEmail(`${templateName}.txt`, parameters);
    })
    .then(result => {
      text = result + "\n--\nEmail Opt-Out: " + "${optOutLink}";
      if (doNotEmail == true) {
        Logger.info(`Account has do_not_email set to true, not emailing.`);
        return Promise.resolve("email");
      }
      if (NODE_ENV === "test") {
        Logger.info(`Test env - not sending email, would have sent:
        From: ${fromAddress}
        To: ${toAddress}
        Subject: ${subject}
        Html: ${html}
        Text: ${text}`);
        return Promise.resolve("testSuccess");
      } else {
        return awsSesClient.sendEmail({
          Source: `OpenAudit <${fromAddress}>`,
          Destination: {
            ToAddresses: [toAddress]
          },
          Message: {
            Subject: {
              Data: subject
            },
            Body: {
              Html: {
                Charset: "UTF-8",
                Data: html
              },
              Text: {
                Charset: "UTF-8",
                Data: text
              }
            }
          }
        }).promise();
      }
    })
    .catch(error => {
      throw new AppError(500, 56, `Error sending ${subject} email from ${fromAddress}`, error);
    });
}

function sendPlain(fromAddress, toAddress, subject, body) {
  if (NODE_ENV === "test") {
    Logger.info(`Test env - not sending email, would have sent:
      From: ${fromAddress}
      To: ${toAddress}
      Subject: ${subject}
      Text: ${body}`);
    return Promise.resolve("testSuccess");
  } else {
    return awsSesClient.sendEmail({
        Source: `OpenAudit <${fromAddress}>`,
        Destination: {
          ToAddresses: [toAddress]
        },
        Message: {
          Subject: {
            Data: subject
          },
          Body: {
            Text: {
              Charset: "UTF-8",
              Data: body
            }
          }
        }
      }).promise()
      .catch(error => {
        throw new AppError(500, 56, `Error sending ${subject} email from ${fromAddress}`, error);
      });
  }
}

function getCompiledEmail(filename, parameters) {
  return fs.readFile(path.join(__dirname, "..", "emails", filename), "utf-8")
    .then(conf => {
      var template = handlebars.compile(conf);
      return template(parameters);
    })
    .catch(error => {
      throw new AppError(500, 56, "Error getting file", error);
    });
}
