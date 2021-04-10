const AppError = require("../error.js");
const Logger = require("../logger.js");

// Utilities
const Database = require("../utilities/database.js");
const Secure = require("../utilities/secure.js");

class Doc {

  constructor(row) {
    if (!row) {
      throw new AppError(500, 999, "Error creating document: Null document.");
    }
    this.id = row.id;
    this.title = row.title;
    this.content = row.content;
    this.owner = row.owner;
    this.visibility = row.visibility;
    this.allowAudit = row.allow_audit;
    this.createDate = row.create_date;
    this.modifyDate = row.modify_date;
    this.featured = row.featured;
    this.alias = row.alias;
    this.url = row.url;

    // joined from user
    this.usersUsername = row.users_username
  }

  static create(content, owner) {
    let id = Secure.generateDocId()
    return Database.query(
      `INSERT INTO docs(id, content, owner)
      VALUES($1, $2, $3)
      RETURNING *`,
      [id, content, owner])
      .catch( error => {
        throw new AppError(500, 14, "Error creating document", error);
      })
      .then( result => {
        return new Doc(result.rows[0]);
      });
  }

  static setFeatured(id, featured) {
    return Database.query(
      `UPDATE docs
      SET featured = $2
      WHERE id = $1
      RETURNING *`,
      [id, featured])
    .catch( error => {
      throw new AppError(500, 299, "Error setting featured", error);
    })
    .then( result => {
      if (result.rows.length === 0) {
        throw new AppError(400, 888, "No such document.");
      }
      return new Doc(result.rows[0]);
    });
  }

  static get(id, requestUserId) {
    return Database.query(
      `SELECT docs.*, users.username AS users_username
      FROM docs
      INNER JOIN users ON (docs.owner = users.id)
      WHERE docs.id = $1 ${requestUserId ? "AND docs.owner = $2" : ""}
      LIMIT 1`,
      requestUserId ? [id, requestUserId] : [id])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting document: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(400, 888, "No such document.");
        }
        let doc = new Doc(result.rows[0]);
        if (doc.visibility === "private" && requestUserId != doc.owner) {
          throw new AppError(400, 888, "No such document.");
        }
        else {
          return doc
        }
      });
  }

  static getWithAlias(alias, requestUserId) {
    return Database.query(
      `SELECT docs.*, users.username AS users_username
      FROM docs
      INNER JOIN users ON (docs.owner = users.id)
      WHERE docs.alias = $1 ${requestUserId ? "AND docs.owner = $2" : ""}
      LIMIT 1`,
      requestUserId ? [alias, requestUserId] : [alias])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting document with alias: ", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(400, 888, "No such document.");
        }
        let doc = new Doc(result.rows[0]);
        if (doc.visibility === "private" && requestUserId != doc.owner) {
          throw new AppError(400, 888, "No such document.");
        }
        else {
          return doc
        }
      });
  }

  static listFeatured() {
    return Database.query(
      `SELECT docs.*, users.username AS users_username
      FROM docs
      INNER JOIN users ON (docs.owner = users.id)
      WHERE docs.featured = true`,
      [])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting featured documents: ", error);
      })
      .then( result => {
        var docs = [];
        result.rows.forEach(row => {
          docs.push(new Doc(row));
        });
        return docs;
      });
  }

  static getAudits(id) {
    return Database.query(
      `SELECT audits.*, users.username AS users_username
      FROM audits
      INNER JOIN users ON (audits.auditor = users.id)
      WHERE doc = $1`,
      [id])
      .catch( error => {
        throw new AppError(500, 7, "Database error getting audits for document: ", error);
      })
      .then( result => {
        var audits = [];
        result.rows.forEach(row => {
          audits.push(new Audit(row));
        });
        return audits;
      });
  }

  static listPublic(userId) {
    return Database.query(
      `SELECT docs.id, docs.owner, docs.title, docs.allow_audit, docs.create_date, docs.modify_date, users.username AS users_username
        FROM docs
        INNER JOIN users ON (docs.owner = users.id)
        WHERE users.id = $1 AND docs.visibility = 'public'
        ORDER BY docs.modify_date DESC`,
      [userId])
      .catch( error => {
        throw new AppError(500, 7, "Database error listing public documents: ", error);
      })
      .then( result => {
        var docs = [];
        result.rows.forEach(row => {
          docs.push(new Doc(row));
        });
        return docs;
      });
  }

  static listOwned(userId) {
    return Database.query(
      `SELECT docs.id, docs.owner, docs.visibility, docs.title, docs.allow_audit, docs.create_date, docs.modify_date, users.username AS users_username
        FROM docs
        INNER JOIN users ON (docs.owner = users.id)
        WHERE docs.owner = $1
        ORDER BY docs.modify_date DESC`,
    [userId])
    .catch(error => {
      throw new AppError(500, 31, "Error getting owned docs", error);
    })
    .then(result => {
      var docs = [];
      result.rows.forEach(row => {
        docs.push(new Doc(row));
      });
      return docs;
    })
  }

  static update(id, title, content, owner, visibility, allowAudit, url) {
    return Database.query(
      `UPDATE docs
      SET content = $1, title = $5, visibility = $4, allow_audit = $6, modify_date = $7, url = $8
      WHERE id = $2 AND owner = $3
      RETURNING *`,
      [content, id, owner, visibility, title, allowAudit, new Date(), url])
    .catch( error => {
      throw new AppError(500, 299, "Error updating document", error);
    })
    .then( result => {
      if (result.rows.length === 0) {
        throw new AppError(400, 888, "No such document.");
      }
      return new Doc(result.rows[0]);
    });
  }

  static setAlias(id, alias, owner) {
    // ensure alias doesn't exist globally
    return Database.query(
      `SELECT id FROM docs
      WHERE alias = $1
      LIMIT 1`,
      [alias])
    .catch( error => {
      throw new AppError(500, 299, "Error checking if alias exists", error);
    })
    .then( result => {
      if (result.rows.length > 0) {
        throw new AppError(400, 2892, "This alias/URL is already in use. Try a different URL.")
      }
      return Database.query(
        `UPDATE docs
        SET alias = $1
        WHERE id = $2 AND owner = $3
        RETURNING *`,
        [alias, id, owner])
      .catch( error => {
        throw new AppError(500, 299, "Error setting alias for document", error);
      })
      .then( result => {
        if (result.rows.length === 0) {
          throw new AppError(400, 888, "No such document.");
        }
        return new Doc(result.rows[0]);
      });
    })
  }

  static delete(id, owner) {
    return Database.query(
      `DELETE FROM docs
        WHERE id = $1 AND owner = $2
        RETURNING *`,
    [id, owner])
    .catch(error => {
      throw new AppError(500, 31, "Error deleting document", error);
    })
    .then(result => {
      if (result.rowCount !== 1) {
        throw new AppError(400, 31, "Id not deleted: " + this.id);
      }
      return new Doc(result.rows[0]);
    });
  }

}

module.exports = Doc;

const Audit = require("./audit-model.js");
