const AppError = require("../error.js");
const Logger = require("../logger.js");

// Utilities
const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");

class Audit {

  constructor(row) {
    if (!row) {
      throw new AppError(500, 999, "Error creating Audit: Null document.");
    }
    this.id = row.id;
    this.data = row.data;
    this.auditor = row.auditor;
    this.doc = row.doc;

    // joined from user
    this.usersUsername = row.users_username

    // joined from docs
    this.docsAllowAudit = row.docs_allowaudit
    this.docsTitle = row.docs_title
    this.docsId = row.docs_id
  }

  static upsert(docId, data, auditorId) {
    let id = Secure.generateAuditId()
    return Database.query(
      `INSERT INTO audits(id, data, auditor, doc)
      VALUES($1, $2, $3, $4)
      ON CONFLICT (auditor, doc)
      DO
      UPDATE SET data = $2
      RETURNING *`,
      [id, data, auditorId, docId])
      .catch( error => {
        throw new AppError(500, 14, "Error upserting Audit", error);
      })
      .then( result => {
        return new Audit(result.rows[0]);
      })
  }

  static get(docId, auditorId) {
    return Database.query(
      `SELECT * FROM audits
      WHERE doc = $1 AND auditor = $2
      LIMIT 1`,
      [docId, auditorId])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting audit: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          // could be first time this auditor is auditing this doc
          // so give something to the client even if it doesn't exist
          let id = Secure.generateAuditId()
          return new Audit({
            id: id,
            data: "{}",
            auditor: auditorId,
            doc: docId
          })
        }
        return new Audit(result.rows[0]);
      });
  }

  static listNonPrivate(auditorId) {
    return Database.query(
      `SELECT audits.auditor, audits.doc, audits.data, docs.title AS docs_title, docs.allow_audit AS docs_allowaudit, docs.id AS docs_id, users.username AS users_username
        FROM audits
        INNER JOIN docs ON (audits.doc = docs.id)
        INNER JOIN users ON (docs.owner = users.id)
        WHERE audits.auditor = $1 AND docs.visibility != 'private'`,
      [auditorId])
      .catch( error => {
        throw new AppError(500, 7, "Database error listing public documents that were audited: ", error);
      })
      .then( result => {
        var audits = [];
        result.rows.forEach(row => {
          audits.push(new Audit(row));
        });
        return audits;
      });
  }


  static listPublic(auditorId) {
    return Database.query(
      `SELECT audits.auditor, audits.doc, audits.data, docs.title AS docs_title, docs.allow_audit AS docs_allowaudit, docs.id AS docs_id, users.username AS users_username
        FROM audits
        INNER JOIN docs ON (audits.doc = docs.id)
        INNER JOIN users ON (docs.owner = users.id)
        WHERE audits.auditor = $1 AND docs.visibility = 'public'`,
      [auditorId])
      .catch( error => {
        throw new AppError(500, 7, "Database error listing public documents that were audited: ", error);
      })
      .then( result => {
        var audits = [];
        result.rows.forEach(row => {
          audits.push(new Audit(row));
        });
        return audits;
      });
  }

}

module.exports = Audit;

const Doc = require("./doc-model.js");
