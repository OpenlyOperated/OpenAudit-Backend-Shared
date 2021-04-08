const AppError = require("../error.js");
const Logger = require("../logger.js");

// Utilities
const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");
const Email = require("../utilities/email.js");

// Constants
const AES_EMAIL_KEY = process.env.AES_EMAIL_KEY;
const EMAIL_SALT = process.env.EMAIL_SALT;

class User {

  constructor(userRow, accessDeleted = false) {
    if (!userRow) {
      throw new AppError(500, 999, "Error creating user: Null user.");
    }
    if (userRow.delete_date && accessDeleted == false) {
      throw new AppError(400, 999, "This user has been deleted and cannot be accessed.");
    }
    this.id = userRow.id;
    this.username = userRow.username;
    this.emailHashed = userRow.email;
    this.emailEncrypted = userRow.email_encrypted;
    this.passwordHashed = userRow.password;
    this.emailConfirmed = userRow.email_confirmed;
    this.emailConfirmCode = userRow.email_confirm_code;
    this.passwordResetCode = userRow.password_reset_code;
    this.createDate = new Date(userRow.create_date);
    this.deleteDate = userRow.delete_date ? new Date(userRow.delete_date) : null;
    this.deleteReason = userRow.delete_reason;
    this.doNotEmail = userRow.do_not_email;
    this.doNotEmailCode = userRow.do_not_email_code;
    this.banned = userRow.banned;
    this.newsletterSubscribed = userRow.newsletter_subscribed;
    this.newsletterUnsubscribeCode = userRow.newsletter_unsubscribe_code;
    this.realName = userRow.real_name;
    this.github = userRow.github;
    this.linkedin = userRow.linkedin;
    this.qualifications = userRow.qualifications;
  }

  get email() {
    if (this.emailEncrypted) {
      return Secure.aesDecrypt(this.emailEncrypted, AES_EMAIL_KEY);
    }
    else {
      return null;
    }
  }

  getOwnProfile() {
    return {
      id: this.id,
      username: this.username,
      emailDecrypted: this.email,
      createDate: this.createDate,
      realName: this.realName,
      github: this.github,
      linkedin: this.linkedin,
      qualifications: this.qualifications
    }
  }

  update(realName, linkedin, github, qualifications) {
    return Database.query(
      `UPDATE users
      SET real_name = $1, linkedin = $2, github = $3, qualifications = $4
      WHERE id = $5
      RETURNING *`,
      [realName, linkedin, github, qualifications, this.id])
    .catch( error => {
      throw new AppError(500, 70, "Error updating user", error);
    })
    .then( result => {
      if (result.rowCount !== 1) {
        throw new AppError(500, 71, "Error updating user: no user changed.");
      }
      return true;
    });
  }

  delete(reason, banned) {
    return Database.query(
      `UPDATE users
        SET
          username = $1,
          email_encrypted = $2,
          password = $3,
          create_date = now(),
          delete_date = now(),
          delete_reason = $4,
          banned = $5
        WHERE id = $6`,
    [generateDeletedValue(), generateDeletedValue(), generateDeletedValue(), reason, banned, this.id])
    .catch(error => {
      throw new AppError(500, 31, "Error deleting user", error);
    })
    .then(result => {
      if (result.rowCount !== 1) {
        throw new AppError(400, 31, "Error deleting user: did not delete id: " + this.id);
      }
      return true;
    });
  }

  changePassword(currentPassword, newPassword) {
    return this.assertPassword(currentPassword)
      .then( passwordMatches => {
        return Secure.hashPassword(newPassword);
      })
      .then(newPasswordHashed => {
        return Database.query(
          `UPDATE users
          SET password = $1
          WHERE id = $2
          RETURNING *`,
          [newPasswordHashed, this.id])
        .catch( error => {
          throw new AppError(500, 70, "Error changing user password", error);
        })
        .then( result => {
          if (result.rowCount !== 1) {
            throw new AppError(500, 71, "Error changing user password: no user changed.");
          }
          return true;
        });
      });
  }

  changeEmail(newEmail) {
    if (this.emailConfirmed !== true) {
      throw new AppError(400, 110, "Can't change email on user without confirmed email.");
    }
    const emailConfirmCode = Secure.generateEmailConfirmCode();
    return User.failIfEmailTaken(newEmail)
      .then(success => {
        const newEmailHashed = Secure.sha512(newEmail, EMAIL_SALT);
        return Database.query(
          `UPDATE users
          SET change_email = $1, email_confirm_code = $2
          WHERE id = $3
          RETURNING *`,
          [newEmailHashed, emailConfirmCode, this.id])
        .catch( error => {
          throw new AppError(500, 299, "Error updating user for changeEmail", error);
        })
        .then( success => {
          return Email.sendChangeEmailConfirmation(newEmail, emailConfirmCode);
        });
      });
  }

  assertPassword(password) {
    return Secure.assertPassword(this.passwordHashed, password);
  }

  static create(username, email, password) {
    return User.failIfUsernameTaken(username)
      .then ( success => {
        return User.failIfEmailTakenOrNotConfirmed(email)
      })
      .then( success => {
        return Secure.hashPassword(password);
      })
      .then(passwordHashed => {
        const newUserId = Secure.generateUserId();
        const emailHashed = Secure.sha512(email, EMAIL_SALT);
        const emailEncrypted = Secure.aesEncrypt(email, AES_EMAIL_KEY);
        const emailConfirmCode = Secure.generateEmailConfirmCode();
        return Database.query(
          `INSERT INTO users(id, username, email, email_encrypted, password, email_confirm_code)
          VALUES($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [newUserId, username, emailHashed, emailEncrypted, passwordHashed, emailConfirmCode])
          .catch( error => {
            throw new AppError(500, 14, "Error creating user", error);
          })
      })
      .then( result => {
        const user = new User(result.rows[0]);
        Email.sendConfirmation(email, user.emailConfirmCode);
        return user;
      });
  }

  static getWithUsername(username, columns = "*", accessDeleted = false, decryptEmail = false) {
    return Database.query(
      `SELECT ${columns} FROM users
      WHERE lower(username) = $1
      LIMIT 1`,
      [username])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting user: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(400, 9922, "User not found.");
        }
        var user = new User(result.rows[0], accessDeleted);
        if (decryptEmail) {
          user.emailDecrypted = user.email;
        }
        delete user.emailEncrypted;
        return user;
      });
  }

  static getWithIdAndPassword(id, password) {
    return module.exports.getWithId(id)
      .then( user => {
        return user.assertPassword(password)
          .then( passwordMatch => {
            return user;
          });
      });
  }

  static getWithId(id, columns = "*", accessDeleted = false) {
    return Database.query(
      `SELECT ${columns} FROM users
      WHERE id = $1
      LIMIT 1`,
      [id])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting user: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(401, 2, "Incorrect Login.");
        }
        return new User(result.rows[0], accessDeleted);
      });
  }

  static getWithEmail(email, columns = "*", accessDeleted = false) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `SELECT ${columns} FROM users
      WHERE email = $1
      LIMIT 1`,
      [emailHashed])
      .catch( error => {
        throw new AppError(500, 7, "Error getting user by email", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(401, 2, "Incorrect Login.");
        }
        return new User(result.rows[0], accessDeleted);
      });
  }

  static getWithEmailAndPassword(email, password) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `SELECT * FROM users
      WHERE email = $1
      ORDER BY email_confirmed DESC
      LIMIT 1`,
      [emailHashed])
      .catch( error => {
        throw new AppError(500, 7, "Error getting user by email", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(401, 2, "Incorrect Login.");
        }
        var user = new User(result.rows[0]);
        return user.assertPassword(password)
          .then( passwordMatch => {
            return user;
          });
      });
  }

  static confirmChangeEmail(code, email) {
    const emailHashed = Secure.sha512(email, EMAIL_SALT);
    const emailEncrypted = Secure.aesEncrypt(email, AES_EMAIL_KEY);
    return Database.query(
    `SELECT * FROM users
    WHERE email_confirm_code = $1
      AND change_email = $2
    LIMIT 1`,
    [code, emailHashed])
    .catch( error => {
      throw new AppError(500, 19, "Error looking up confirmation code", error);
    })
    .then( result => {
      if (result.rows.length !== 1) {
        throw new AppError(400, 18, "Error looking up confirmation code - not found.");
      }
      var user = new User(result.rows[0]);
      // Confirm the email - update database
      return Database.query(
        `UPDATE users
        SET email = $1, email_encrypted = $2, change_email = NULL
        WHERE email_confirm_code = $3 AND
          change_email = $1
        RETURNING *`,
        [emailHashed, emailEncrypted, code])
      .catch( error => {
        throw new AppError(500, 19, "Error accepting confirmation code", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 18, "No such confirmation code and email combination");
        }
        return user;
      });
    });
  }

  static confirmEmail(code, email) {
    const emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
    `SELECT * FROM users
    WHERE email_confirm_code = $1
      AND email = $2
    LIMIT 1`,
    [code, emailHashed])
    .catch( error => {
      throw new AppError(500, 19, "Error looking up confirmation code", error);
    })
    .then( result => {
      if (result.rows.length !== 1) {
        throw new AppError(400, 18, "Error looking up confirmation code - not found.");
      }
      var user = new User(result.rows[0]);
      // If already confirmed, end here
      if (user.emailConfirmed) {
        return true;
      }
      // Not confirmed, confirm it.
      return Database.query(
        `UPDATE users
        SET email_confirmed = true
        WHERE email_confirm_code = $1 AND
          email_confirmed = false AND
          email = $2
        RETURNING *`,
        [code, emailHashed])
      .catch( error => {
        throw new AppError(500, 19, "Error accepting confirmation code", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 18, "No such confirmation code and email combination");
        }
        return user;
      });
    });
  }

  static failIfUsernameTaken(username) {
    return Database.query(
      `SELECT * FROM users
      WHERE lower(username) = $1
      LIMIT 1`,
      [username])
      .catch( error => {
        throw new AppError(500, 15, "Error checking if username already exists.", error);
      })
      .then( result => {
        if (result.rows.length === 1) {
          var user = new User(result.rows[0]);
          if (!user.emailConfirmed) {
            throw new AppError(400, 1, "That username is registered, but email has not been confirmed. Check your email for the confirmation link.");
          }
          else {
            throw new AppError(400, 40, "That username is already registered. Please try signing in.");
          }
        }
        return username;
      });
  }

  static failIfEmailTakenOrNotConfirmed(email) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `SELECT * FROM users
      WHERE email = $1
      LIMIT 1`,
      [emailHashed])
      .catch( error => {
        throw new AppError(500, 15, "Error checking if email already exists.", error);
      })
      .then( result => {
        if (result.rows.length === 1) {
          var user = new User(result.rows[0]);
          if (!user.emailConfirmed) {
            throw new AppError(400, 1, "Email registered, but not confirmed. Check email for the confirmation link.");
          }
          else {
            throw new AppError(400, 40, "That email is already registered. Please try signing in.");
          }
        }
        return emailHashed;
      });
  }

  static resendConfirmCode(email) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `SELECT *
      FROM users
      WHERE email = $1
      LIMIT 1`,
      [emailHashed])
      .catch( error => {
        throw new AppError(500, 58, "Error looking up email for resending confirm code", error);
      })
      .then( result => {
        if (result.rows.length !== 1) {
          throw new AppError(400, 59, "No such email");
        }
        var user = new User(result.rows[0]);
        if (user.emailConfirmed) {
          throw new AppError(400, 60, "Email already confirmed. Try signing in.");
        }
        else {
          return Email.sendConfirmation(email, user.emailConfirmCode, true);
        }
      });
  }

  static generatePasswordReset(email) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    var passwordResetCode = Secure.generatePasswordResetCode();
    return Database.query(
      `UPDATE users
      SET password_reset_code = $1
      WHERE email = $2 AND
        email_confirmed = true
      RETURNING *`,
      [passwordResetCode, emailHashed])
      .catch( error => {
        throw new AppError(500, 72, "Error adding password reset code to database", error);
      })
      .then( result => {
        if (result.rowCount === 1) {
          return Email.sendResetPassword(email, passwordResetCode);
        }
        else {
          return true;
        }
      });
  }

  static resetPassword(code, newPassword) {
    return Secure.hashPassword(newPassword)
      .then(newPasswordHashed => {
        return Database.query(
          `UPDATE users
          SET password = $1,
            password_reset_code = NULL
          WHERE password_reset_code = $2
          RETURNING *`,
          [newPasswordHashed, code]);
      })
      .catch( error => {
        throw new AppError(500, 76, "Error setting new user password", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 77, "Error setting new user password: Invalid reset code.");
        }
        return true;
      });
  }

  static setDoNotEmail(email, code) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `UPDATE users
      SET do_not_email = true
      WHERE email = $1 AND do_not_email_code = $2
      RETURNING *`,
      [emailHashed, code])
      .catch( error => {
        throw new AppError(500, 7, "Error setting do not email", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 89, "Wrong code and/or email for email opt-out");
        }
        return true;
      });
  }

  static setNewsletterUnsubscribe(email, code) {
    var emailHashed = Secure.sha512(email, EMAIL_SALT);
    return Database.query(
      `UPDATE users
      SET newsletter_subscribed = false
      WHERE email = $1 AND newsletter_unsubscribe_code = $2
      RETURNING *`,
      [emailHashed, code])
      .catch( error => {
        throw new AppError(500, 7, "Error setting newsletter unsubscribe", error);
      })
      .then( result => {
        if (result.rowCount !== 1) {
          throw new AppError(400, 89, "Wrong code and/or email for newsletter unsubscribe");
        }
        return true;
      });
  }

}

module.exports = User;

const Doc = require("./doc-model.js");
