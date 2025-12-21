/**
 * Register command - Create new passport
 * 
 * @license Apache-2.0
 */

import { createVcCommand } from './create-vc';

export async function registerCommand(options: any, command: any) {
  try {
    console.log('The legacy "register" command has been replaced by "create-vc".');
    console.log('Use: dpp-cli create-vc --json <file> --account <uri> [--issuer-did <did:web:...>]');
    process.exit(1);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
