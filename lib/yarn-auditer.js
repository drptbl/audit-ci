/*
 * Copyright IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
const childProcess = require('child_process');
const spawn = require('cross-spawn');
const semver = require('semver');
const reporter = require('./reporter');

const MINIMUM_YARN_VERSION = '1.12.3';

let failedLevelsFound;

function getYarnVersion() {
  const version = childProcess
    .execSync('yarn -v')
    .toString()
    .replace('\n', '');
  return version;
}

function yarnSupportsAudit(yarnVersion) {
  return semver.gte(yarnVersion, MINIMUM_YARN_VERSION);
}

const genReport = (
  stdin,
  output = 'yarn-audit.html',
  template,
  showUnique = true
) => {
  if (!stdin) {
    console.log('No JSON');
    return process.exit(1);
  }

  const data = stdin.split(/\n/).filter(line => line !== '');

  let json;
  try {
    json = data.map(JSON.parse);
  } catch (err) {
    console.error('Failed to parse NPM/Yarn Audit JSON!');
    return process.exit(1);
  }

  const templateFile = template || `${__dirname}/templates/template.hbs`;

  return reporter(json, templateFile, output, showUnique)
    .then(() => {
      console.log(`Vulnerability snapshot saved at ${output}`);
      if (failedLevelsFound) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      console.log('An error occurred!');
      console.error(error);
      process.exit(1);
    });
};

/**
 * Audit your NPM project!
 *
 * @param {{report: boolean, whitelist: string[], advisories: string[], levels: { low: boolean, moderate: boolean, high: boolean, critical: boolean }}} config
 * `report`: whether to show the NPM audit report in the console.
 * `whitelist`: a list of packages that should not break the build if their vulnerability is found.
 * `advisories`: a list of advisory ids that should not break the build if found.
 * `levels`: the vulnerability levels to fail on, if `moderate` is set `true`, `high` and `critical` should be as well.
 * @returns {Promise<none>} Returns nothing on resolve, `Error` on rejection.
 */
function audit(config) {
  return new Promise((resolve, reject) => {
    const yarnVersion = getYarnVersion();
    const isYarnVersionSupported = yarnSupportsAudit(yarnVersion);
    if (!isYarnVersionSupported) {
      reject(
        Error(
          `Yarn ${yarnVersion} not supported, must be >=${MINIMUM_YARN_VERSION}`
        )
      );
    }

    const proc = spawn('yarn', ['audit', '--json']);

    const { advisories, levels, report, whitelist } = config;
    if (whitelist.length) {
      console.log(`Modules to whitelist: ${whitelist.join(', ')}.`);
    }

    const failedLevels = {
      low: false,
      moderate: false,
      high: false,
      critical: false,
    };
    const whitelistedModulesFound = [];
    const whitelistedAdvisoriesFound = [];
    let missingLockFile = false;

    let bufferedOutput = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', data => {
      /** @type {{ type: string, data: any }} */
      bufferedOutput += data;
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', jsonl => {
      /** @type {{ type: string, data: any }} */
      const errorLine = JSON.parse(jsonl);
      if (errorLine.type === 'error') {
        reject(Error(errorLine.data));
      }
    });
    proc.on('close', () => {
      if (report) {
        genReport(
          bufferedOutput
          // output,
          // template,
          // unique
        );
      }
      bufferedOutput
        .split('\n')
        .filter(line => line.trim().length > 0)
        .forEach(jsonBlob => {
          const auditLine = JSON.parse(jsonBlob);
          const { type, data } = auditLine;
          if (type === 'auditAdvisory') {
            const { id, module_name: moduleName, severity } = data.advisory;
            if (levels[severity]) {
              if (whitelist.some(m => m === moduleName)) {
                whitelistedModulesFound.push(moduleName);
              } else if (advisories.some(a => +a === id)) {
                whitelistedAdvisoriesFound.push(id);
              } else {
                failedLevels[severity] = true;
              }
            }
          } else if (type === 'info' && data === 'No lockfile found.') {
            missingLockFile = true;
          }
        });

      if (missingLockFile) {
        console.warn(
          '\x1b[33m%s\x1b[0m',
          'No yarn.lock file. This does not affect auditing, but it may be a mistake.'
        );
      }
      if (whitelistedModulesFound.length) {
        const found = whitelistedModulesFound.join(', ');
        const msg = `Vulnerable whitelisted modules found: ${found}.`;
        console.warn('\x1b[33m%s\x1b[0m', msg);
      }
      if (whitelistedAdvisoriesFound.length) {
        const found = whitelistedAdvisoriesFound.join(', ');
        const msg = `Vulnerable whitelisted advisories found: ${found}.`;
        console.warn('\x1b[33m%s\x1b[0m', msg);
      }

      // Get the levels that have failed by filtering the keys with true values
      failedLevelsFound = Object.keys(failedLevels)
        .filter(l => failedLevels[l])
        .join(', ');
      // If any of the levels have been failed
      if (failedLevelsFound) {
        const err = `Failed security audit due to ${failedLevelsFound} vulnerabilities.`;
        reject(Error(err));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { audit };
