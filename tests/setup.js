const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

function loadFixture(name) {
  const p = path.join(REPO, "tests", "fixtures", name);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

global.__FIXTURES__ = {
  garco: loadFixture("garco_fixtures.json"),
};

global.REPO = REPO;
