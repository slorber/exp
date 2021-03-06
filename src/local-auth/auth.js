import child_process from 'child_process';
import slash from 'slash';
import spawnAsync from '@expo/spawn-async';
import { basename } from 'path';
import inquirer from 'inquirer';

import log from '../log';

const FASTLANE =
  process.platform === 'darwin'
    ? require('@expo/traveling-fastlane-darwin')()
    : require('@expo/traveling-fastlane-linux')();

const WSL_BASH = 'C:\\Windows\\system32\\bash.exe';
const WSL_ONLY_PATH = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function appStoreAction(creds, metadata, teamId, action) {
  const args = [
    action,
    creds.appleId,
    creds.password,
    teamId,
    metadata.bundleIdentifier,
    metadata.experienceName,
  ];
  return spawnAndCollectJSONOutputAsync(FASTLANE.app_management, args);
}

export function createAppOnPortal(creds, metadata, teamId) {
  return appStoreAction(creds, metadata, teamId, 'create');
}

export function ensureAppIdLocally(creds, metadata, teamId) {
  return appStoreAction(creds, metadata, teamId, 'verify');
}

export function produceProvisionProfile(credentials, { bundleIdentifier }, teamId) {
  return spawnAndCollectJSONOutputAsync(FASTLANE.fetch_new_provisioning_profile, [
    credentials.appleId,
    credentials.password,
    bundleIdentifier,
    teamId,
  ]);
}

export function producePushCerts(credentials, { bundleIdentifier }, teamId) {
  return spawnAndCollectJSONOutputAsync(FASTLANE.fetch_push_cert, [
    credentials.appleId,
    credentials.password,
    bundleIdentifier,
    teamId,
  ]);
}

export function produceCerts(credentials, teamId) {
  return spawnAndCollectJSONOutputAsync(FASTLANE.fetch_cert, [
    credentials.appleId,
    credentials.password,
    teamId,
  ]);
}

export async function validateCredentialsProduceTeamId(creds, metadata) {
  const getTeamsAttempt = await spawnAndCollectJSONOutputAsync(
    FASTLANE.validate_apple_credentials,
    [creds.appleId, creds.password]
  );
  if (getTeamsAttempt.result === 'failure') {
    const { reason, rawDump } = getTeamsAttempt;
    throw new Error(`Reason:${reason}, raw:${JSON.stringify(rawDump)}`);
  }
  const { teams } = getTeamsAttempt;
  if (teams.length === 0) {
    throw new Error('You have no team ID associated with your apple account, cannot proceed');
  }
  log(`You have ${teams.length} teams`);
  if (teams.length === 1) {
    console.log(`Only 1 team associated with your account, using Team ID: ${teams[0].teamId}`);
    return { teamId: teams[0].teamId };
  } else {
    teams.forEach((team, i) => {
      console.log(`${i + 1}) ${team['teamId']} "${team['name']}" (${team['type']})`);
    });
    const answers = await inquirer.prompt({
      type: 'input',
      name: 'choice',
      message: `Which Team ID to use?`,
      validate: val => !Number.isNaN(parseInt(val, 10)),
    });
    return { teamId: teams[+answers.choice - 1].teamId };
  }
}

const windowsToWSLPath = p => {
  const noSlashes = slash(p);
  return noSlashes.slice(2, noSlashes.length);
};

let fastlaneScratchPad = null;

export async function cleanUp() {
  if (process.platform === 'win32' && fastlaneScratchPad !== null) {
    await spawnAsync(WSL_BASH, ['-c', `rm -rf ${fastlaneScratchPad}`]);
  }
}

async function spawnAndCollectJSONOutputAsync(program, args) {
  if (process.platform === 'win32' && fastlaneScratchPad === null) {
    const tmpDir = await spawnAsync(WSL_BASH, ['-c', 'mktemp -d']);
    const tmp = tmpDir.stdout.trim();
    const cmd = `cp -R '/mnt/c${windowsToWSLPath(FASTLANE.ruby_dir)}' ${tmp}/fastlane`;
    await spawnAsync(WSL_BASH, ['-c', cmd]);
    fastlaneScratchPad = `${tmp}/fastlane`;
  }

  return new Promise((resolve, reject) => {
    const jsonContent = [];
    const opts = { stdio: ['inherit', 'pipe', 'pipe'] };
    try {
      if (process.platform === 'win32') {
        const script = basename(program);
        const cmd = ['-c', `${WSL_ONLY_PATH} ${fastlaneScratchPad}/${script} ${args.join(' ')}`];
        var child = child_process.spawn(WSL_BASH, cmd, opts);
      } else {
        var child = child_process.spawn(program, args, opts);
      }
    } catch (e) {
      return reject(e);
    }
    child.stdout.on('data', d => console.log(d.toString()));
    // This is where we get our replies back from the ruby code
    child.stderr.on('data', d => jsonContent.push(d));
    child.stdout.on('end', () => {
      const reply = Buffer.concat(jsonContent).toString();
      try {
        resolve(JSON.parse(reply));
      } catch (e) {
        reject({
          result: 'failure',
          reason: 'Could not understand JSON reply from Ruby local auth scripts',
          rawDump: reply,
        });
      }
    });
  });
}
