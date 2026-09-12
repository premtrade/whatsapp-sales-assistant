module.exports = {
  testEnvironment: "node",
  testMatch: [
    "**/unit/**/*.js",
    "**/security/**/*.js",
    "**/workflows/**/*.js",
    "**/__tests__/**/*.js"
  ],
  verbose: true,
  collectCoverage: false,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  setupFilesAfterEnv: ["<rootDir>/setup.js"],
  testTimeout: 30000,
};
