const Logger = require("./logger.js");

const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");

function getEmpty() {
  return fs.readFile(path.join(__dirname, "schema.sql"), "utf-8");
}

function getTemplated(mainPass, debugPass) {
  return fs.readFile(path.join(__dirname, "schema.sql"), "utf-8")
  .then( schema => {
    Logger.info("Read schema from disk.");
    var template = handlebars.compile(schema);
    const filledTemplate = template({
      main_password: mainPass,
      debug_password: debugPass
    });
    return filledTemplate;
  });
}

module.exports = {
  getTemplated: getTemplated,
  getEmpty: getEmpty
}
